import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Download } from "lucide-react";
import { api, type Voice } from "../lib/api";

const EXAMPLES = [
  ["greeting", "Hello from Vaani. Voice AI for India and beyond, built on open source."],
  ["helpdesk", "Welcome back. Your order has been shipped and will arrive on Tuesday."],
  ["story", "Once upon a time, in a small village far from any city, there lived a clever little mouse."],
  ["corporate", "The quarterly report shows a fifteen percent growth in subscription revenue."],
] as const;

export function TTS() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState<string>("en-emma_woman");
  const [text, setText] = useState<string>(EXAMPLES[0][1]);
  const [cfg, setCfg] = useState(1.5);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ ms: number; bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .voices()
      .then((v) => {
        const sorted = [...v.voices].sort((a, b) => a.id.localeCompare(b.id));
        setVoices(sorted);
        if (!sorted.find((x) => x.id === voice)) {
          setVoice(sorted.find((x) => x.id === "en-emma_woman")?.id || sorted[0]?.id || "");
        }
      })
      .catch((e) => setError(`Couldn't load voices: ${e.message}`));
  }, []);

  const groupedVoices = useMemo(() => {
    const g: Record<string, Voice[]> = {};
    for (const v of voices) {
      const lang = v.id.split("-")[0].toUpperCase();
      (g[lang] ||= []).push(v);
    }
    return g;
  }, [voices]);

  async function generate() {
    if (!text.trim() || !voice) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setMeta(null);
    const t0 = performance.now();
    try {
      const blob = await api.speech(text, voice, cfg);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setMeta({ ms: performance.now() - t0, bytes: blob.size });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Text to Speech</h1>
      <p className="text-muted mt-1">VibeVoice-Realtime-0.5B · 24 kHz mono PCM output.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-2">
            Text
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={4000}
            className="w-full bg-panel-2 border border-border rounded-lg p-3 focus:outline-none focus:border-accent"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {EXAMPLES.map(([label, value]) => (
              <button
                key={label}
                onClick={() => setText(value)}
                className="text-xs px-3 py-1.5 rounded-full border border-border text-muted hover:text-text hover:border-text"
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted self-center">
              {text.length} / 4000
            </span>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-2">
              Voice
            </label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent"
            >
              {Object.entries(groupedVoices).map(([lang, list]) => (
                <optgroup key={lang} label={lang}>
                  {list.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.stem}
                      {v.id.startsWith("in-") ? " 🇮🇳" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-2">
              CFG scale ({cfg.toFixed(1)})
            </label>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={cfg}
              onChange={(e) => setCfg(parseFloat(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <button
          onClick={generate}
          disabled={loading || !text.trim() || !voice}
          className="bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-accent-2 transition-colors"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {loading ? "Generating…" : "Generate Speech"}
        </button>
        {error && <span className="text-err text-sm">{error}</span>}
        {meta && !error && (
          <span className="text-muted text-sm">
            {(meta.ms / 1000).toFixed(2)}s · {(meta.bytes / 1024).toFixed(1)} KB
          </span>
        )}
      </div>

      {audioUrl && (
        <div className="mt-6 p-5 bg-panel border border-border rounded-xl">
          <div className="text-xs uppercase tracking-wide text-muted mb-3">Output</div>
          <audio controls src={audioUrl} className="w-full" />
          <a
            href={audioUrl}
            download="vaani.wav"
            className="inline-flex items-center gap-2 text-sm text-accent hover:underline mt-3"
          >
            <Download size={14} /> Download .wav
          </a>
        </div>
      )}
    </div>
  );
}
