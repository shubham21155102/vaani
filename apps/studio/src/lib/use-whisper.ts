// React hook around the WebGPU Whisper worker.
// Captures audio via Web Audio API, does simple energy-based VAD to chunk
// utterances, sends each chunk to the worker, surfaces transcripts.
import { useCallback, useEffect, useRef, useState } from "react";

export type WhisperState =
  | { kind: "idle" }
  | { kind: "loading"; progress: number }
  | { kind: "ready" }
  | { kind: "listening" }
  | { kind: "transcribing" }
  | { kind: "error"; message: string };

interface UseWhisperOpts {
  enabled: boolean;
  onTranscript: (text: string) => void;
  language?: string;
}

const SAMPLE_RATE = 16000;
const FRAME_MS = 50;
const FRAME_SAMPLES = (SAMPLE_RATE * FRAME_MS) / 1000;
const SPEECH_RMS_THRESHOLD = 0.015;
const MIN_UTTERANCE_MS = 600;
const SILENCE_TAIL_MS = 600;
const MAX_UTTERANCE_MS = 12_000;

export function useWhisper({ enabled, onTranscript, language }: UseWhisperOpts) {
  const [state, setState] = useState<WhisperState>({ kind: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopFlagRef = useRef(false);

  // Keep latest callbacks in refs so the audio loop reads fresh values.
  const onTranscriptRef = useRef(onTranscript);
  const languageRef = useRef(language);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Spawn worker once (and only when enabled).
  useEffect(() => {
    if (!enabled) return;
    if (workerRef.current) return;
    const worker = new Worker(
      new URL("./whisper-worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;
    setState({ kind: "loading", progress: 0 });
    worker.onmessage = (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "loading") {
        setState({ kind: "loading", progress: m.progress ?? 0 });
      } else if (m.type === "ready") {
        setState({ kind: "ready" });
      } else if (m.type === "transcript") {
        const text = String(m.text || "").trim();
        if (text) onTranscriptRef.current(text);
        setState({ kind: "ready" });
      } else if (m.type === "error") {
        setState({ kind: "error", message: m.message || "worker error" });
      }
    };
    worker.postMessage({ type: "init" });
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  const start = useCallback(async () => {
    if (!enabled) return;
    if (!workerRef.current) return;
    if (streamRef.current) return; // already running
    stopFlagRef.current = false;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: SAMPLE_RATE,
      },
      video: false,
    });
    streamRef.current = stream;

    const ctx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
      sampleRate: SAMPLE_RATE,
    });
    ctxRef.current = ctx;

    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(2048, 1, 1);
    source.connect(processor);
    processor.connect(ctx.destination);

    const speechBuf: Float32Array[] = [];
    let speechSamples = 0;
    let silenceMs = 0;
    let inSpeech = false;
    setState({ kind: "listening" });

    processor.onaudioprocess = (ev) => {
      if (stopFlagRef.current) return;
      const ch = ev.inputBuffer.getChannelData(0);

      // Frame-level RMS detection.
      let sumSq = 0;
      for (let i = 0; i < ch.length; i++) sumSq += ch[i] * ch[i];
      const rms = Math.sqrt(sumSq / ch.length);
      const isVoiced = rms > SPEECH_RMS_THRESHOLD;
      const frameMs = (ch.length / SAMPLE_RATE) * 1000;

      if (isVoiced) {
        const copy = new Float32Array(ch.length);
        copy.set(ch);
        speechBuf.push(copy);
        speechSamples += ch.length;
        silenceMs = 0;
        inSpeech = true;
      } else if (inSpeech) {
        // Hold a brief tail of silence in the utterance for cleaner cut.
        const copy = new Float32Array(ch.length);
        copy.set(ch);
        speechBuf.push(copy);
        speechSamples += ch.length;
        silenceMs += frameMs;
      }

      const utteranceMs = (speechSamples / SAMPLE_RATE) * 1000;
      const shouldFlush =
        inSpeech &&
        ((silenceMs >= SILENCE_TAIL_MS && utteranceMs >= MIN_UTTERANCE_MS) ||
          utteranceMs >= MAX_UTTERANCE_MS);

      if (shouldFlush) {
        const flat = new Float32Array(speechSamples);
        let off = 0;
        for (const b of speechBuf) {
          flat.set(b, off);
          off += b.length;
        }
        speechBuf.length = 0;
        speechSamples = 0;
        silenceMs = 0;
        inSpeech = false;
        setState({ kind: "transcribing" });
        workerRef.current!.postMessage(
          { type: "transcribe", audio: flat, lang: languageRef.current },
          [flat.buffer]
        );
      }
    };
  }, [enabled]);

  const stop = useCallback(() => {
    stopFlagRef.current = true;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {});
      ctxRef.current = null;
    }
    setState((s) => (s.kind === "error" ? s : { kind: "ready" }));
  }, []);

  // Auto-stop on disable / unmount.
  useEffect(() => {
    if (!enabled) stop();
    return () => stop();
  }, [enabled, stop]);

  return { state, start, stop };
}
