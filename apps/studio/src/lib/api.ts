export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://vaani-api.shubhamiitbhu.in";

export interface Voice {
  id: string;
  stem: string;
}

export interface Info {
  service: string;
  version: string;
  tts_model: string;
  ready: boolean;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, init);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export const api = {
  info: () => json<Info>("/api/info"),
  voices: () => json<{ voices: Voice[] }>("/v1/voices"),

  async speech(input: string, voice: string, cfg_scale = 1.5): Promise<Blob> {
    const r = await fetch(`${API_BASE}/v1/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input, voice, cfg_scale, response_format: "wav" }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || `HTTP ${r.status}`);
    }
    return r.blob();
  },

  async transcribe(file: File): Promise<{ text: string; language?: string }> {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API_BASE}/v1/audio/transcriptions`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || `HTTP ${r.status}`);
    }
    return r.json();
  },
};
