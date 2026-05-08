import { API_BASE } from "../lib/api";

const blocks: { title: string; lang: string; code: string }[] = [
  {
    title: "Generate speech (curl)",
    lang: "bash",
    code: `curl -X POST ${API_BASE}/v1/audio/speech \\
  -H 'Content-Type: application/json' \\
  -d '{"input":"Hello from Vaani.","voice":"en-emma_woman"}' \\
  --output out.wav`,
  },
  {
    title: "Generate speech (Python)",
    lang: "python",
    code: `import requests

r = requests.post(
    "${API_BASE}/v1/audio/speech",
    json={"input": "Hello from Vaani.", "voice": "en-emma_woman"},
)
r.raise_for_status()
open("out.wav", "wb").write(r.content)`,
  },
  {
    title: "Generate speech (Node)",
    lang: "ts",
    code: `import fs from "node:fs";

const r = await fetch("${API_BASE}/v1/audio/speech", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ input: "Hello from Vaani.", voice: "en-emma_woman" }),
});
fs.writeFileSync("out.wav", Buffer.from(await r.arrayBuffer()));`,
  },
  {
    title: "List voices",
    lang: "bash",
    code: `curl ${API_BASE}/v1/voices`,
  },
  {
    title: "Service info",
    lang: "bash",
    code: `curl ${API_BASE}/api/info`,
  },
];

export function Docs() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">API Reference</h1>
      <p className="text-muted mt-1">
        OpenAI-shape JSON. Drop us in as a swap for <code>/v1/audio/speech</code>.
      </p>

      <div className="mt-6 p-5 bg-panel border border-border rounded-xl">
        <div className="text-xs uppercase tracking-wide text-muted">Base URL</div>
        <div className="font-mono text-accent mt-1 break-all">{API_BASE}</div>
      </div>

      <div className="mt-8 space-y-6">
        {blocks.map((b) => (
          <div key={b.title}>
            <h2 className="font-medium mb-2">{b.title}</h2>
            <pre className="p-4 bg-panel-2 border border-border rounded-lg overflow-x-auto text-xs font-mono">
              <code>{b.code}</code>
            </pre>
          </div>
        ))}
      </div>

      <div className="mt-10 text-xs text-muted">
        Disclose AI-generated audio when you share it. Voice impersonation without consent is
        prohibited under Microsoft VibeVoice's usage guidelines.
      </div>
    </div>
  );
}
