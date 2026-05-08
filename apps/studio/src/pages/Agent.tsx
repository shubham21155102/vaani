import { useCallback, useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalParticipant,
} from "livekit-client";
import { Mic, MicOff, Phone, PhoneOff, Loader2, Cpu, MessageSquare } from "lucide-react";
import { agentApi, api, type AgentPreset, type Voice } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWhisper } from "../lib/use-whisper";
import { VoiceWave } from "../components/VoiceWave";
import { Select, type SelectGroup, type SelectOption } from "../components/Select";

type Status = "idle" | "connecting" | "connected" | "ending" | "error";

interface TranscriptLine {
  who: "you" | "assistant";
  text: string;
  ts: number;
}

export function Agent() {
  const { token, user } = useAuth();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [agentJoined, setAgentJoined] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [agents, setAgents] = useState<AgentPreset[]>([]);
  const [agentId, setAgentId] = useState<string>("general");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceOverride, setVoiceOverride] = useState<string>("");
  const [browserSttEnabled, setBrowserSttEnabled] = useState<boolean>(false);
  
  const [userLevel, setUserLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [webgpuSupported, setWebgpuSupported] = useState<boolean>(false);

  useEffect(() => {
    setVoiceOverride("");
  }, [agentId]);

  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const has = typeof navigator !== "undefined" && "gpu" in navigator;
    setWebgpuSupported(Boolean(has));
  }, []);

  useEffect(() => {
    if (status !== "connected") {
      setUserLevel(0);
      setAgentLevel(0);
      setUserSpeaking(false);
      setAgentSpeaking(false);
      return;
    }
    let raf = 0;
    const tick = () => {
      const room = roomRef.current;
      if (room) {
        const lp = room.localParticipant;
        const agent = [...room.remoteParticipants.values()].find((p) =>
          p.identity.startsWith("agent")
        );
        setUserLevel((cur) => cur + ((lp.audioLevel || 0) - cur) * 0.4);
        setAgentLevel((cur) => cur + ((agent?.audioLevel || 0) - cur) * 0.4);
        setUserSpeaking(Boolean(lp.isSpeaking));
        setAgentSpeaking(Boolean(agent?.isSpeaking));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  const handleLocalTranscript = useCallback((text: string) => {
    if (!text) return;
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    setTranscript((prev) => [...prev, { who: "you", text, ts: Date.now() }]);
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "user_text", text })
    );
    lp.publishData(payload, { reliable: true, topic: "user_text" }).catch(() => {});
  }, []);

  const whisper = useWhisper({
    enabled: browserSttEnabled && status === "connected",
    onTranscript: handleLocalTranscript,
  });

  useEffect(() => {
    agentApi.list().then((r) => setAgents(r.agents)).catch(() => {});
    api
      .voices(token)
      .then((r) =>
        setVoices([...r.voices].sort((a, b) => a.id.localeCompare(b.id)))
      )
      .catch(() => {});
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function connect() {
    if (!token) return;
    setStatus("connecting");
    setError(null);
    setTranscript([]);
    setAgentJoined(false);

    try {
      const { url, token: lkToken } = await agentApi.token(
        token,
        agentId,
        voiceOverride || null
      );
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        publishDefaults: { dtx: true },
      });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        if (p.identity.startsWith("agent")) setAgentJoined(true);
      });
      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        if (p.identity.startsWith("agent")) setAgentJoined(false);
      });
      room.on(
        RoomEvent.TrackSubscribed,
        (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio && audioRef.current) {
            track.attach(audioRef.current);
          }
        }
      );
      room.on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, p?: RemoteParticipant | LocalParticipant) => {
          try {
            const msg = JSON.parse(new TextDecoder().decode(payload));
            if (msg?.text) {
              const who: TranscriptLine["who"] =
                p?.identity?.startsWith("agent") || msg.role === "assistant"
                  ? "assistant"
                  : "you";
              setTranscript((prev) => [
                ...prev,
                { who, text: String(msg.text), ts: Date.now() },
              ]);
            }
          } catch {
            // ignore
          }
        }
      );

      await room.connect(url, lkToken);
      await room.localParticipant.setMicrophoneEnabled(!browserSttEnabled);

      for (const p of room.remoteParticipants.values()) {
        if (p.identity.startsWith("agent")) setAgentJoined(true);
      }

      setStatus("connected");
      if (browserSttEnabled) {
        try {
          await whisper.start();
        } catch (e: unknown) {
          setError(
            "WebGPU mic capture failed: " +
              (e instanceof Error ? e.message : String(e))
          );
        }
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
      try {
        await roomRef.current?.disconnect();
      } catch {
        // ignore
      }
      roomRef.current = null;
    }
  }

  async function disconnect() {
    setStatus("ending");
    whisper.stop();
    try {
      await roomRef.current?.disconnect();
    } catch {
      // ignore
    }
    roomRef.current = null;
    setStatus("idle");
    setMuted(false);
    setAgentJoined(false);
  }

  async function toggleMute() {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    const next = !muted;
    await lp.setMicrophoneEnabled(!next);
    setMuted(next);
  }

  return (
    <div className="animate-fade-in pb-12">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-accent to-[#f97316]">
          VOICE AGENT
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg flex items-center gap-2">
          <MessageSquare size={18} className="text-[#f97316]" />
          Real-time neural interface powered by LiveKit & VibeVoice.
        </p>
      </div>

      <div className="grid lg:grid-cols-[1fr,1fr] gap-6 items-start">
        {/* Left Col: Config & Call Control */}
        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-border/50 shadow-xl">
            <h2 className="text-[10px] font-mono uppercase tracking-widest text-muted mb-4 border-b border-border/50 pb-2">
              Agent Configuration
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-2 ml-1">
                  Select Construct
                </label>
                <Select
                  value={agentId}
                  onChange={setAgentId}
                  disabled={status === "connected" || status === "connecting"}
                  placeholder="Select an agent…"
                  options={
                    agents.length === 0
                      ? [{ value: "general", label: "Vaani Assistant" }]
                      : agents.map<SelectOption>((a) => ({
                          value: a.id,
                          label: a.name,
                          hint: a.description,
                        }))
                  }
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-2 ml-1">
                  Voice Override
                </label>
                <Select
                  value={voiceOverride}
                  onChange={setVoiceOverride}
                  disabled={status === "connected" || status === "connecting"}
                  placeholder="Choose a voice…"
                  groups={(() => {
                    const defaultVoice =
                      agents.find((a) => a.id === agentId)?.voice ||
                      "en-emma_woman";
                    const groups: SelectGroup[] = [
                      {
                        label: "Default",
                        options: [
                          {
                            value: "",
                            label: "Use agent's default",
                            meta: defaultVoice,
                          },
                        ],
                      },
                    ];
                    const byLang: Record<string, Voice[]> = {};
                    const myVoices = voices.filter((v) => v.user);
                    if (myVoices.length) {
                      groups.push({
                        label: "My Voices",
                        options: myVoices.map((v) => ({
                          value: v.id,
                          label: v.stem,
                          meta: v.id,
                          badge: "★",
                        })),
                      });
                    }
                    for (const v of voices) {
                      if (v.user) continue;
                      const lang = (
                        v.language || v.id.split("-")[0]
                      ).toUpperCase();
                      (byLang[lang] ||= []).push(v);
                    }
                    for (const lang of Object.keys(byLang).sort()) {
                      groups.push({
                        label: lang,
                        options: byLang[lang].map((v) => ({
                          value: v.id,
                          label: v.stem,
                          meta: v.id,
                          badge: lang === "HI" ? "🇮🇳" : undefined,
                        })),
                      });
                    }
                    return groups;
                  })()}
                />
              </div>

              <div className="pt-4 border-t border-border/50">
                <label className="flex items-start gap-3 cursor-pointer group">
                  <div className="relative flex items-center justify-center mt-0.5">
                    <input
                      type="checkbox"
                      checked={browserSttEnabled}
                      onChange={(e) => setBrowserSttEnabled(e.target.checked)}
                      disabled={
                        !webgpuSupported ||
                        status === "connected" ||
                        status === "connecting"
                      }
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${browserSttEnabled ? 'bg-accent border-accent' : 'bg-panel-2 border-border/50 group-hover:border-accent/50'}`}>
                      {browserSttEnabled && <Cpu size={12} className="text-panel font-bold" />}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold tracking-wide text-text group-hover:text-accent transition-colors">
                      Local STT (WebGPU Whisper)
                    </div>
                    <p className="text-xs text-muted/80 mt-1 leading-relaxed">
                      Process audio entirely on-device for maximum privacy and zero latency.
                      {!webgpuSupported && (
                        <span className="text-err font-bold block mt-1">
                          [ERROR: WebGPU NOT DETECTED]
                        </span>
                      )}
                    </p>
                    {browserSttEnabled && whisper.state.kind === "loading" && (
                      <div className="mt-2 h-1.5 w-full bg-panel-2 rounded-full overflow-hidden">
                        <div className="h-full bg-accent animate-pulse" style={{ width: `${Math.max(10, (whisper.state.progress || 0) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                </label>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-border/50 shadow-xl relative overflow-hidden group">
            {status === "connected" && (
              <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent pointer-events-none" />
            )}
            <div className="flex items-center gap-5 relative z-10">
              <div className="relative w-20 h-20 rounded-full bg-panel-2/80 border border-border/50 flex items-center justify-center flex-shrink-0">
                <span
                  className="absolute inset-0 rounded-full transition-transform duration-150"
                  style={{
                    transform: `scale(${1 + agentLevel * 0.4})`,
                    boxShadow: agentSpeaking
                      ? `0 0 ${20 + agentLevel * 60}px rgba(255, 42, 95, ${0.4 + agentLevel * 0.5})`
                      : undefined,
                    backgroundColor: agentSpeaking ? 'rgba(255, 42, 95, 0.1)' : 'transparent',
                  }}
                />
                {(status === "connecting" || (status === "connected" && !agentJoined)) && (
                  <span className="absolute inset-0 rounded-full border-2 border-accent/50 border-t-transparent animate-spin" />
                )}
                <Phone size={28} className={status === "connected" ? "text-accent drop-shadow-[0_0_8px_rgba(255,42,95,0.8)]" : "text-muted"} />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="font-display font-bold tracking-widest flex items-center gap-3">
                  <span className="truncate">
                    {status === "idle" && "READY FOR LINK"}
                    {status === "connecting" && "ESTABLISHING LINK..."}
                    {status === "connected" && agentJoined && agentSpeaking && <span className="text-accent animate-pulse">AGENT SPEAKING</span>}
                    {status === "connected" && agentJoined && !agentSpeaking && userSpeaking && <span className="text-ok">LISTENING...</span>}
                    {status === "connected" && agentJoined && !agentSpeaking && !userSpeaking && "LINK ACTIVE"}
                    {status === "connected" && !agentJoined && "WAITING FOR AGENT..."}
                    {status === "ending" && "TERMINATING..."}
                    {status === "error" && <span className="text-err">LINK FAILED</span>}
                  </span>
                  {status === "connected" && (
                    <div className="shrink-0 w-16">
                      <VoiceWave
                        level={Math.max(userLevel, agentLevel)}
                        active={userSpeaking || agentSpeaking}
                        color={agentSpeaking ? "accent" : userSpeaking ? "ok" : "muted"}
                      />
                    </div>
                  )}
                </div>
                <div className="text-[10px] font-mono text-muted/60 mt-1 uppercase">
                  {user ? `OPERATIVE: ${user.display_name || user.email}` : "UNAUTHORIZED ACCESS"}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3 relative z-10">
              {status === "idle" || status === "error" ? (
                <button
                  onClick={connect}
                  disabled={!token}
                  className="flex-1 bg-gradient-to-r from-accent to-accent-2 text-white disabled:from-panel-2 disabled:to-panel-2 px-5 py-3.5 rounded-xl font-bold tracking-widest flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,42,95,0.4)] transition-all uppercase"
                >
                  <Phone size={18} /> INITIATE LINK
                </button>
              ) : status === "connecting" ? (
                <button disabled className="flex-1 bg-panel-2 border border-border/50 text-muted px-5 py-3.5 rounded-xl font-bold tracking-widest flex items-center justify-center gap-2 uppercase">
                  <Loader2 size={18} className="animate-spin" /> CONNECTING
                </button>
              ) : (
                <>
                  <button
                    onClick={toggleMute}
                    className={`p-3.5 rounded-xl font-bold flex items-center justify-center transition-all ${muted ? 'bg-err/20 text-err border border-err/30' : 'bg-panel-2 border border-border/50 hover:bg-border/50 text-text'}`}
                    title={muted ? "Unmute" : "Mute"}
                  >
                    {muted ? <MicOff size={20} /> : <Mic size={20} />}
                  </button>
                  <button
                    onClick={disconnect}
                    className="flex-1 bg-err hover:bg-err/90 text-white px-5 py-3.5 rounded-xl font-bold tracking-widest flex items-center justify-center gap-2 transition-all uppercase hover:shadow-[0_0_20px_rgba(255,23,68,0.4)]"
                  >
                    <PhoneOff size={18} /> TERMINATE
                  </button>
                </>
              )}
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-err/10 border border-err/30 rounded-lg text-err text-[10px] font-mono uppercase">
                ERROR: {error}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Terminal Transcript */}
        <div className="glass-panel rounded-2xl border border-border/50 shadow-xl flex flex-col h-[500px] lg:h-[600px] overflow-hidden">
          <div className="p-3 border-b border-border/50 bg-panel-2/30 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-err"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-accent-2"></div>
            <div className="w-2.5 h-2.5 rounded-full bg-ok"></div>
            <span className="ml-2 text-[10px] font-mono text-muted/60 uppercase tracking-widest">
              Live Transcript Terminal
            </span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 font-mono text-xs md:text-sm">
            {transcript.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted/40 space-y-4">
                <MessageSquare size={48} className="opacity-20" />
                <p className="max-w-[200px] text-center leading-relaxed">
                  {status === "connected"
                    ? "AWAITING VOCAL INPUT..."
                    : "INITIATE LINK TO BEGIN TRANSCRIPTION."}
                </p>
              </div>
            ) : (
              <ul className="space-y-4">
                {transcript.map((line, i) => (
                  <li key={i} className={`flex flex-col ${line.who === 'you' ? 'items-end' : 'items-start'}`}>
                    <span className={`text-[9px] uppercase tracking-widest mb-1 opacity-60 ${line.who === 'you' ? 'text-ok' : 'text-accent'}`}>
                      {line.who === 'you' ? 'OPERATIVE' : 'AGENT'} // {new Date(line.ts).toISOString().substring(11, 19)}
                    </span>
                    <div className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${line.who === 'you' ? 'bg-panel-2 border border-border/50 text-text/90 rounded-tr-sm' : 'bg-accent/10 border border-accent/20 text-accent rounded-tl-sm shadow-[0_0_15px_rgba(255,42,95,0.05)]'}`}>
                      {line.text}
                    </div>
                  </li>
                ))}
                <div ref={transcriptEndRef} />
              </ul>
            )}
          </div>
        </div>
      </div>

      <audio ref={audioRef} autoPlay playsInline className="hidden" />

      {!token && (
        <div className="mt-8 p-4 bg-err/10 border border-err/30 rounded-xl text-sm font-mono text-err font-bold uppercase text-center">
          ACCESS DENIED: Authentication required to initialize agent link.
        </div>
      )}
    </div>
  );
}
