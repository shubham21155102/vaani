import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, AudioLines } from "lucide-react";
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
        "Hello. This is a quick voice preview from the Vaani neural network.",
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
    <div className="animate-fade-in pb-24">
      <div className="mb-10">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#8b5cf6] to-[#d946ef]">
          VOICE CATALOG
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg flex items-center gap-2">
          <AudioLines size={18} className="text-[#d946ef]" />
          <span className="font-mono text-accent">{voices.length}</span> NEURAL VOICES · <span className="font-mono text-accent">{Object.keys(grouped).length}</span> LANGUAGE FAMILIES
        </p>
      </div>
      
      {error && (
        <div className="mb-8 p-4 bg-err/10 border border-err/20 rounded-xl">
          <p className="text-err text-xs font-mono font-bold uppercase">ERROR: {error}</p>
        </div>
      )}

      {Object.entries(grouped).map(([lang, list]) => (
        <section key={lang} className="mt-12 relative">
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-lg font-display font-bold tracking-widest text-text">{lang}</h2>
            <div className="flex-1 h-px bg-gradient-to-r from-border/80 to-transparent" />
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.map((v) => (
              <div
                key={v.id}
                className="group glass-panel p-5 rounded-2xl border border-border/50 hover:border-[#d946ef]/50 hover:shadow-[0_0_20px_rgba(217,70,239,0.15)] transition-all duration-300 flex items-center gap-4 relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-[#8b5cf6]/5 to-[#d946ef]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                <div className="flex-1 min-w-0 relative z-10">
                  <div className="font-bold tracking-wide text-sm truncate group-hover:text-[#d946ef] transition-colors">
                    {v.stem.toUpperCase()}
                  </div>
                  <div className="text-[10px] text-muted/60 font-mono mt-1.5 truncate">
                    {v.id}
                  </div>
                </div>
                
                <button
                  onClick={() => preview(v)}
                  disabled={previewing === v.id}
                  className="w-10 h-10 shrink-0 rounded-xl bg-panel-2/80 border border-border/50 hover:border-[#d946ef]/50 hover:bg-[#d946ef]/10 hover:text-[#d946ef] flex items-center justify-center disabled:opacity-50 transition-all relative z-10"
                  title="Preview Voice"
                >
                  {previewing === v.id ? (
                    <Loader2 size={16} className="animate-spin text-[#d946ef]" />
                  ) : (
                    <Play size={16} className="fill-current ml-0.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}

      {previewUrl && (
        <div className="fixed bottom-6 right-6 p-5 glass-panel border border-[#d946ef]/50 rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(217,70,239,0.2)] z-50 animate-slide-up w-[320px]">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[#d946ef] flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-[#d946ef] animate-pulse" />
              Previewing Matrix
            </div>
            <button onClick={() => setPreviewUrl(null)} className="text-muted hover:text-text text-xs">✕</button>
          </div>
          <div className="text-sm font-bold truncate mb-3">{previewUrl.id.toUpperCase()}</div>
          <audio controls autoPlay src={previewUrl.url} className="w-full h-8" />
        </div>
      )}
    </div>
  );
}
