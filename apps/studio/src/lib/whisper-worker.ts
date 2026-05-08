/// <reference lib="webworker" />
// Web Worker that runs Whisper-small locally on WebGPU via Transformers.js.
// Stays alive across utterances so the model loads once.
//
// Message protocol (worker ← main):
//   { type: "init" }                                  → load model
//   { type: "transcribe", audio: Float32Array, lang?: string }
//                                                      → run inference
//
// Worker → main:
//   { type: "ready" }
//   { type: "loading", progress: 0..1 }
//   { type: "transcript", text: string, ms: number }
//   { type: "error", message: string }
import { pipeline, env, type Pipeline } from "@huggingface/transformers";

env.allowLocalModels = false;
env.useBrowserCache = true;

const MODEL_ID = "onnx-community/whisper-base";

declare const self: DedicatedWorkerGlobalScope;

let asr: Pipeline | null = null;
let loading: Promise<Pipeline> | null = null;

function post(msg: unknown) {
  self.postMessage(msg);
}

async function load() {
  if (asr) return asr;
  if (loading) return loading;
  loading = (async () => {
    post({ type: "loading", progress: 0 });
    const p = await pipeline("automatic-speech-recognition", MODEL_ID, {
      device: "webgpu",
      dtype: "fp16",
      progress_callback: (info: { status: string; progress?: number }) => {
        if (info.status === "progress" && typeof info.progress === "number") {
          post({ type: "loading", progress: info.progress / 100 });
        }
      },
    });
    asr = p as unknown as Pipeline;
    post({ type: "ready" });
    return asr;
  })();
  return loading;
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data;
  try {
    if (data?.type === "init") {
      await load();
      return;
    }
    if (data?.type === "transcribe") {
      const t0 = performance.now();
      const p = await load();
      const audio = data.audio as Float32Array;
      const language = (data.lang as string | undefined) || "english";
      const out = await (p as unknown as (
        audio: Float32Array,
        options: { language: string; task: string; return_timestamps: boolean }
      ) => Promise<{ text?: string } | { text?: string }[]>)(audio, {
        language,
        task: "transcribe",
        return_timestamps: false,
      });
      const text = (Array.isArray(out) ? out[0]?.text : out?.text) || "";
      post({
        type: "transcript",
        text: String(text).trim(),
        ms: Math.round(performance.now() - t0),
      });
    }
  } catch (err: unknown) {
    post({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};

// Auto-init on worker spawn.
load().catch((err) => post({ type: "error", message: String(err) }));
