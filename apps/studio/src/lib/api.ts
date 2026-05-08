export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ||
  "https://vaani-api.shubhamiitbhu.in";

export interface Voice {
  id: string;
  stem: string;
  language?: string;
  user?: boolean;
  created_at?: string;
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

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface ApiKey {
  id: number;
  name: string;
  display: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  key?: string; // only on create
}

export const keysApi = {
  list: (token: string) =>
    json<{ keys: ApiKey[] }>("/v1/keys", { headers: authHeaders(token) }),
  create: (token: string, name: string) =>
    json<ApiKey>("/v1/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ name }),
    }),
  revoke: (token: string, id: number) =>
    json<{ ok: boolean }>(`/v1/keys/${id}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
};

export interface Package {
  id: string;
  credits: number;
  amount_inr: number;
  label: string;
}

export interface Payment {
  order_id: string;
  package_id: string;
  amount_inr: number;
  credits: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

export const agentApi = {
  token: (token: string) =>
    json<{ url: string; token: string; room: string }>("/v1/agent/token", {
      method: "POST",
      headers: authHeaders(token),
    }),
};

export const billingApi = {
  packages: () =>
    json<{ packages: Package[]; currency: string }>("/v1/billing/packages"),
  checkout: (token: string, package_id: string) =>
    json<{
      order_id: string;
      payment_session_id: string;
      amount_inr: number;
      credits: number;
    }>("/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ package_id }),
    }),
  payments: (token: string) =>
    json<{ payments: Payment[] }>("/v1/billing/payments", {
      headers: authHeaders(token),
    }),
};

export const voicesApi = {
  list: (token: string | null) =>
    json<{ voices: Voice[] }>("/v1/voices", {
      headers: authHeaders(token),
    }),
  async upload(token: string, name: string, file: File): Promise<Voice> {
    const fd = new FormData();
    fd.append("name", name);
    fd.append("file", file);
    const r = await fetch(`${API_BASE}/v1/voices/upload`, {
      method: "POST",
      headers: authHeaders(token),
      body: fd,
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({ detail: r.statusText }));
      throw new Error(err.detail || `HTTP ${r.status}`);
    }
    return r.json();
  },
  delete: (token: string, voiceId: string) =>
    json<{ ok: boolean }>(`/v1/voices/${encodeURIComponent(voiceId)}`, {
      method: "DELETE",
      headers: authHeaders(token),
    }),
};

export const api = {
  info: () => json<Info>("/api/info"),
  voices: (token?: string | null) =>
    json<{ voices: Voice[] }>("/v1/voices", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),

  async speech(
    input: string,
    voice: string,
    cfg_scale = 1.5,
    token?: string | null
  ): Promise<Blob> {
    const r = await fetch(`${API_BASE}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
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
