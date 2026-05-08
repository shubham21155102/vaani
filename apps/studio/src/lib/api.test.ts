import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, agentApi, billingApi, keysApi, voicesApi, API_BASE } from "./api";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockJson(body: unknown, ok = true, status = 200) {
  fetchMock.mockResolvedValueOnce({
    ok,
    status,
    statusText: ok ? "OK" : "Bad",
    json: async () => body,
    blob: async () => new Blob(),
  } as unknown as Response);
}

describe("api.info", () => {
  it("hits /api/info on the configured API base", async () => {
    mockJson({ service: "vaani", ready: true, tts_model: "x", version: "0.1.0" });
    await api.info();
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/api/info`, undefined);
  });

  it("throws on non-ok with the server's detail", async () => {
    mockJson({ detail: "service down" }, false, 503);
    await expect(api.info()).rejects.toThrow("service down");
  });
});

describe("api.voices", () => {
  it("sends auth header when token present", async () => {
    mockJson({ voices: [] });
    await api.voices("jwt-tok");
    const args = fetchMock.mock.calls[0];
    expect(args[1].headers).toMatchObject({ Authorization: "Bearer jwt-tok" });
  });

  it("omits auth header when token is null", async () => {
    mockJson({ voices: [] });
    await api.voices(null);
    const args = fetchMock.mock.calls[0];
    expect(args[1].headers).toEqual({});
  });
});

describe("api.speech", () => {
  it("posts JSON body with voice + cfg + token", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => new Blob(["wav"]),
    } as unknown as Response);
    await api.speech("hello", "en-emma_woman", 1.5, "tok");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toMatchObject({
      input: "hello",
      voice: "en-emma_woman",
      cfg_scale: 1.5,
      response_format: "wav",
    });
  });

  it("throws on 401 from the server", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "authentication required" }),
    } as unknown as Response);
    await expect(
      api.speech("text", "en-emma_woman", 1.5, "bad-tok")
    ).rejects.toThrow("authentication required");
  });
});

describe("billingApi", () => {
  it("checkout sends package_id with auth", async () => {
    mockJson({
      order_id: "vaani-1-test",
      payment_session_id: "session_xx",
      amount_inr: 99,
      credits: 1000,
    });
    await billingApi.checkout("tok", "starter");
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ package_id: "starter" });
  });
});

describe("keysApi", () => {
  it("revoke sends DELETE with auth", async () => {
    mockJson({ ok: true });
    await keysApi.revoke("tok", 42);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/v1/keys/42");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
});

describe("agentApi", () => {
  it("token sends agent_id and optional voice", async () => {
    mockJson({
      url: "wss://x",
      token: "tok",
      room: "vaani-1-general",
      agent_id: "general",
    });
    await agentApi.token("tok", "general", "en-emma_woman");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.agent_id).toBe("general");
    expect(body.voice).toBe("en-emma_woman");
  });

  it("token omits voice when null/undefined", async () => {
    mockJson({ url: "wss://x", token: "t", room: "r", agent_id: "general" });
    await agentApi.token("tok", "general");
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.voice).toBeUndefined();
  });
});

describe("voicesApi", () => {
  it("upload posts FormData", async () => {
    mockJson({ id: "user1-x", stem: "x" });
    const f = new File([new Uint8Array([1, 2, 3])], "x.wav", { type: "audio/wav" });
    await voicesApi.upload("tok", "x", f);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers.Authorization).toBe("Bearer tok");
  });
});
