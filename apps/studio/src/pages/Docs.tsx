import { API_BASE } from "../lib/api";
import { BookOpen } from "lucide-react";

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
    <div className="animate-fade-in pb-12">
      <div className="mb-10">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-2">
          API REFERENCE
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg flex items-center gap-2">
          <BookOpen size={18} className="text-accent" />
          OpenAI-compatible JSON endpoints. Seamless integration matrix.
        </p>
      </div>

      <div className="glass-panel p-6 border border-accent/20 rounded-2xl relative overflow-hidden mb-10 shadow-[0_0_20px_rgba(255,42,95,0.05)]">
        <div className="absolute top-0 left-0 w-1 bg-accent h-full shadow-[0_0_10px_#ff2a5f]" />
        <div className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2 font-bold">API Base Endpoint</div>
        <div className="font-mono text-text text-sm sm:text-base break-all bg-panel-2/50 p-3 rounded-lg border border-border/50 select-all">
          {API_BASE}
        </div>
      </div>

      <div className="space-y-8">
        {blocks.map((b) => (
          <div key={b.title} className="glass-panel border border-border/50 rounded-2xl overflow-hidden group hover:border-accent/30 transition-colors">
            <div className="bg-panel-2/50 border-b border-border/50 px-5 py-3 flex items-center justify-between">
              <h2 className="font-display font-bold tracking-wide text-sm text-text/90 group-hover:text-accent transition-colors">{b.title}</h2>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted bg-panel border border-border/50 px-2 py-0.5 rounded">
                {b.lang}
              </span>
            </div>
            <pre className="p-5 overflow-x-auto text-[13px] font-mono text-text/80 leading-relaxed bg-[#0a0a0a]">
              <code>{b.code}</code>
            </pre>
          </div>
        ))}
      </div>

      <div className="mt-12 glass-panel p-6 border border-border/50 rounded-2xl bg-panel-2/30">
        <div className="text-[10px] font-mono uppercase tracking-widest text-accent-2 mb-2 font-bold flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-accent-2 animate-pulse" />
          Compliance & Ethics Notice
        </div>
        <p className="text-xs text-muted/80 leading-relaxed font-medium">
          Disclose AI-generated audio when sharing it publicly. Voice impersonation without explicit consent is strictly prohibited under the system usage guidelines.
        </p>
      </div>
    </div>
  );
}
