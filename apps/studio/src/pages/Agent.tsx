import { useEffect, useRef, useState } from "react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type LocalParticipant,
} from "livekit-client";
import { Mic, MicOff, Phone, PhoneOff, Loader2 } from "lucide-react";
import { agentApi, type AgentPreset } from "../lib/api";
import { useAuth } from "../lib/auth";

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

  const roomRef = useRef<Room | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    agentApi.list().then((r) => setAgents(r.agents)).catch(() => {});
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  async function connect() {
    if (!token) return;
    setStatus("connecting");
    setError(null);
    setTranscript([]);
    setAgentJoined(false);

    try {
      const { url, token: lkToken } = await agentApi.token(token, agentId);
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
      await room.localParticipant.setMicrophoneEnabled(true);

      // Mark already-present agents.
      for (const p of room.remoteParticipants.values()) {
        if (p.identity.startsWith("agent")) setAgentJoined(true);
      }

      setStatus("connected");
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
        {agents.find((a) => a.id === agentId)?.voice && (
          <p className="text-xs text-muted mt-1">
            voice: <code className="font-mono">{agents.find((a) => a.id === agentId)?.voice}</code>
          </p>
        )}
      </div>

      <div className="mt-6 p-6 bg-panel border border-border rounded-xl">
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 rounded-full bg-panel-2 border border-border flex items-center justify-center">
            <span
              className={[
                "absolute inset-0 rounded-full",
                status === "connected" && agentJoined ? "animate-ping bg-accent/30" : "",
              ].join(" ")}
            />
            <Phone size={22} className="text-accent relative" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              {status === "idle" && "Ready"}
              {status === "connecting" && "Connecting…"}
              {status === "connected" && (agentJoined ? "Connected · Vaani is listening" : "Connected · waiting for assistant…")}
              {status === "ending" && "Hanging up…"}
              {status === "error" && "Connection failed"}
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
