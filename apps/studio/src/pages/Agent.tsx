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
import { Mic, MicOff, Phone, PhoneOff, Loader2, Cpu } from "lucide-react";
import { agentApi, api, type AgentPreset, type Voice } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useWhisper } from "../lib/use-whisper";
import { VoiceWave } from "../components/VoiceWave";

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
  const [webgpuSupported, setWebgpuSupported] = useState<boolean>(false);

  // When the user changes the agent, reset the voice override to that
  // agent's default. Empty string means "use preset default" on the server.
  useEffect(() => {
    setVoiceOverride("");
  }, [agentId]);

  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Detect WebGPU once on mount.
  useEffect(() => {
    const has = typeof navigator !== "undefined" && "gpu" in navigator;
    setWebgpuSupported(Boolean(has));
  }, []);

  // Browser STT — load model only while toggle is on; route transcripts to
  // the room as data messages so the agent worker treats them as user input.
  const handleLocalTranscript = useCallback((text: string) => {
    if (!text) return;
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    setTranscript((prev) => [...prev, { who: "you", text, ts: Date.now() }]);
    const payload = new TextEncoder().encode(
      JSON.stringify({ type: "user_text", text })
    );
    // reliable + topic so the agent can filter
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
        setVoices(
          [...r.voices].sort((a, b) => a.id.localeCompare(b.id))
        )
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
            // not JSON; ignore
          }
        }
      );

      await room.connect(url, lkToken);
      // If browser STT is on, the user's mic stays muted in the room — we'll
      // do recognition locally and send text. Otherwise mic publishes normally
      // for server-side STT.
      await room.localParticipant.setMicrophoneEnabled(!browserSttEnabled);

      // Mark already-present agents.
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
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Voice Agent</h1>
      <p className="text-muted mt-1">
        Talk to Vaani in real time. Powered by LiveKit, Groq Qwen3-32B, and our own VibeVoice.
      </p>

      <div className="mt-6 p-5 bg-panel border border-border rounded-xl">
        <label className="block text-xs uppercase tracking-wide text-muted mb-2">
          Choose an agent
        </label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          disabled={status === "connected" || status === "connecting"}
          className="w-full bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent disabled:opacity-60"
        >
          {agents.length === 0 ? (
            <option value="general">Vaani Assistant</option>
          ) : (
            agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.description}
              </option>
            ))
          )}
        </select>
        <label className="block text-xs uppercase tracking-wide text-muted mt-4 mb-2">
          Voice
        </label>
        <select
          value={voiceOverride}
          onChange={(e) => setVoiceOverride(e.target.value)}
          disabled={status === "connected" || status === "connecting"}
          className="w-full bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent disabled:opacity-60"
        >
          <option value="">
            Default for this agent (
            {agents.find((a) => a.id === agentId)?.voice || "en-emma_woman"})
          </option>
          {(() => {
            const groups: Record<string, Voice[]> = {};
            for (const v of voices) {
              const lang = (v.language || v.id.split("-")[0]).toUpperCase();
              (groups[lang] ||= []).push(v);
            }
            return Object.entries(groups)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([lang, list]) => (
                <optgroup key={lang} label={lang}>
                  {list.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.stem}
                      {v.user ? "  ★" : ""}
                    </option>
                  ))}
                </optgroup>
              ));
          })()}
        </select>
        <p className="text-xs text-muted mt-1">
          {voiceOverride
            ? "Overriding the agent's default voice."
            : "Using this agent's default voice."}
        </p>

        <div className="mt-5 pt-5 border-t border-border">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={browserSttEnabled}
              onChange={(e) => setBrowserSttEnabled(e.target.checked)}
              disabled={
                !webgpuSupported ||
                status === "connected" ||
                status === "connecting"
              }
              className="mt-1 accent-accent"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Cpu size={14} className="text-accent" />
                Run STT in your browser (WebGPU Whisper)
              </div>
              <p className="text-xs text-muted mt-1">
                Audio never leaves your device. Lower server cost, better privacy.
                {!webgpuSupported && (
                  <span className="text-err">
                    {" "}— Your browser doesn't expose WebGPU; toggle disabled.
                  </span>
                )}
              </p>
              {browserSttEnabled && whisper.state.kind === "loading" && (
                <p className="text-xs text-muted mt-1">
                  Loading Whisper model… {Math.round((whisper.state.progress || 0) * 100)}%
                </p>
              )}
              {browserSttEnabled && whisper.state.kind === "error" && (
                <p className="text-xs text-err mt-1">
                  Whisper error: {whisper.state.message}
                </p>
              )}
              {browserSttEnabled &&
                (whisper.state.kind === "ready" ||
                  whisper.state.kind === "listening" ||
                  whisper.state.kind === "transcribing") && (
                  <p className="text-xs text-ok mt-1">
                    Whisper {whisper.state.kind === "transcribing" ? "transcribing…" : "ready"}
                  </p>
                )}
            </div>
          </label>
        </div>
      </div>

      <div className="mt-6 p-6 bg-panel border border-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full bg-panel-2 border border-border flex items-center justify-center overflow-visible">
            {/* Pulsing ring when agent is actively speaking */}
            <span
              className={[
                "absolute inset-0 rounded-full transition-transform duration-150",
                agentSpeaking ? "scale-125 bg-ok/20" : "scale-100 bg-transparent",
              ].join(" ")}
              style={{
                boxShadow: agentSpeaking
                  ? `0 0 ${24 + agentLevel * 80}px rgba(34, 197, 94, ${0.3 + agentLevel * 0.6})`
                  : undefined,
              }}
            />
            <span
              className={[
                "absolute inset-0 rounded-full",
                status === "connected" && agentJoined && !agentSpeaking
                  ? "animate-ping bg-accent/20"
                  : "",
              ].join(" ")}
            />
            <Phone size={22} className="text-accent relative" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium flex items-center gap-3">
              <span>
                {status === "idle" && "Ready"}
                {status === "connecting" && "Connecting…"}
                {status === "connected" && agentJoined && agentSpeaking && "Vaani is speaking…"}
                {status === "connected" && agentJoined && !agentSpeaking && userSpeaking && "Listening…"}
                {status === "connected" && agentJoined && !agentSpeaking && !userSpeaking && "Connected · Vaani is listening"}
                {status === "connected" && !agentJoined && "Connected · waiting for assistant…"}
                {status === "ending" && "Hanging up…"}
                {status === "error" && "Connection failed"}
              </span>
              {status === "connected" && (
                <VoiceWave
                  level={Math.max(userLevel, agentLevel)}
                  active={userSpeaking || agentSpeaking}
                  color={agentSpeaking ? "ok" : userSpeaking ? "accent" : "muted"}
                />
              )}
            </div>
            <div className="text-xs text-muted mt-0.5">
              {user ? `Joined as ${user.display_name || user.email}` : "Not signed in"}
            </div>
          </div>

          {status === "idle" || status === "error" ? (
            <button
              onClick={connect}
              disabled={!token}
              className="bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-accent-2"
            >
              <Phone size={16} /> Start call
            </button>
          ) : status === "connecting" ? (
            <button disabled className="bg-[#444] text-[#999] px-5 py-2.5 rounded-lg font-medium flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Connecting
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="p-3 rounded-lg bg-panel-2 hover:bg-border"
                title={muted ? "Unmute" : "Mute"}
              >
                {muted ? <MicOff size={16} className="text-err" /> : <Mic size={16} />}
              </button>
              <button
                onClick={disconnect}
                className="bg-err text-white px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:opacity-90"
              >
                <PhoneOff size={16} /> End
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 p-3 border border-err rounded-lg text-err text-sm">{error}</div>
        )}

        <audio ref={audioRef} autoPlay playsInline controls className="mt-4 w-full" />
      </div>

      <h2 className="mt-8 text-sm uppercase tracking-wide text-muted">Transcript</h2>
      <div className="mt-3 p-5 bg-panel border border-border rounded-xl min-h-[200px]">
        {transcript.length === 0 ? (
          <p className="text-sm text-muted">
            {status === "connected"
              ? "Speak — your words will show up here, and the assistant's replies under them."
              : "Start a call to see the live transcript."}
          </p>
        ) : (
          <ul className="space-y-3">
            {transcript.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={[
                    "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full self-start mt-0.5 flex-shrink-0",
                    line.who === "you"
                      ? "bg-panel-2 text-muted"
                      : "bg-accent text-[#1a1300]",
                  ].join(" ")}
                >
                  {line.who}
                </span>
                <p className="text-sm flex-1">{line.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!token && (
        <div className="mt-6 p-4 bg-panel-2 border border-border rounded-lg text-sm text-muted">
          Sign in to start a voice conversation.
        </div>
      )}
    </div>
  );
}
