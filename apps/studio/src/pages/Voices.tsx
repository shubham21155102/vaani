import { useEffect, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
import { api, type Voice } from "../lib/api";

export function Voices() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    api
      .voices()
      .then((v) => setVoices([...v.voices].sort((a, b) => a.id.localeCompare(b.id))))
      .catch((e) => setError(e.message));
  }, []);

  const grouped = useMemo(() => {
    const g: Record<string, Voice[]> = {};
    for (const v of voices) {
      const lang = v.id.split("-")[0].toUpperCase();
      (g[lang] ||= []).push(v);
    }
    return g;
  }, [voices]);

  async function preview(v: Voice) {
    setPreviewing(v.id);
    try {
      const blob = await api.speech(
        "Hello. This is a quick voice preview from Vaani.",
        v.id,
        1.5
      );
      const url = URL.createObjectURL(blob);
      setPreviewUrl({ id: v.id, url });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewing(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Voices</h1>
      <p className="text-muted mt-1">
        {voices.length} voices · {Object.keys(grouped).length} language families.
      </p>
      {error && <p className="mt-4 text-err text-sm">{error}</p>}

      {Object.entries(grouped).map(([lang, list]) => (
        <section key={lang} className="mt-8">
          <h2 className="text-sm uppercase tracking-wide text-muted mb-3">{lang}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((v) => (
              <div
                key={v.id}
                className="p-4 bg-panel border border-border rounded-xl flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{v.stem}</div>
                  <div className="text-xs text-muted font-mono mt-1">{v.id}</div>
                </div>
                <button
                  onClick={() => preview(v)}
                  disabled={previewing === v.id}
                  className="w-9 h-9 rounded-md bg-panel-2 hover:bg-border flex items-center justify-center disabled:opacity-50"
                  title="Preview"
                >
                  {previewing === v.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Play size={14} />
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {previewUrl && (
        <div className="fixed bottom-4 right-4 p-4 bg-panel border border-border rounded-xl shadow-lg">
          <div className="text-xs text-muted mb-2">{previewUrl.id}</div>
          <audio controls autoPlay src={previewUrl.url} />
        </div>
      )}
    </div>
  );
}
