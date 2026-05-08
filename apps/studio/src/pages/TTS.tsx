import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Download, Upload, Trash2, Zap } from "lucide-react";
import { api, voicesApi, type Voice } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Select, type SelectGroup } from "../components/Select";

const EXAMPLES: ReadonlyArray<readonly [string, string]> = [
  ["greeting", "Hello from Vaani. Voice AI for India and beyond, built on open source."],
  ["helpdesk", "Welcome back. Your order has been shipped and will arrive on Tuesday."],
  ["story", "Once upon a time, in a small village far from any city, there lived a clever little mouse."],
  ["corporate", "The quarterly report shows a fifteen percent growth in subscription revenue."],
  ["hindi", "नमस्ते, मैं वाणी हूँ। यह एक हिंदी परीक्षण है।"],
] as const;

export function TTS() {
  const { token } = useAuth();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voice, setVoice] = useState<string>("en-emma_woman");
  const [text, setText] = useState<string>(EXAMPLES[0][1]);
  const [cfg, setCfg] = useState(1.5);
  const [loading, setLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ ms: number; bytes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Voice upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function refreshVoices() {
    try {
      const v = await api.voices(token);
      const sorted = [...v.voices].sort((a, b) => a.id.localeCompare(b.id));
      setVoices(sorted);
      if (!sorted.find((x) => x.id === voice)) {
        setVoice(sorted.find((x) => x.id === "en-emma_woman")?.id || sorted[0]?.id || "");
      }
    } catch (e: unknown) {
      setError(`Couldn't load voices: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    refreshVoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const groupedVoices = useMemo(() => {
    const groups: { label: string; list: Voice[] }[] = [];
    const myVoices = voices.filter((v) => v.user);
    if (myVoices.length) groups.push({ label: "MY VOICES", list: myVoices });
    const byLang: Record<string, Voice[]> = {};
    for (const v of voices) {
      if (v.user) continue;
      const lang = (v.language || v.id.split("-")[0]).toUpperCase();
      (byLang[lang] ||= []).push(v);
    }
    for (const lang of Object.keys(byLang).sort()) {
      groups.push({ label: lang, list: byLang[lang] });
    }
    return groups;
  }, [voices]);

  async function generate() {
    if (!text.trim() || !voice) return;
    setLoading(true);
    setError(null);
    setAudioUrl(null);
    setMeta(null);
    const t0 = performance.now();
    try {
      const blob = await api.speech(text, voice, cfg, token);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setMeta({ ms: performance.now() - t0, bytes: blob.size });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function uploadVoice() {
    if (!token || !uploadName.trim() || !uploadFile) return;
    setUploading(true);
    setUploadError(null);
    try {
      const v = await voicesApi.upload(token, uploadName.trim(), uploadFile);
      await refreshVoices();
      setVoice(v.id);
      setUploadName("");
      setUploadFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  async function deleteVoice(voiceId: string) {
    if (!token) return;
    if (!confirm("Delete this voice?")) return;
    try {
      await voicesApi.delete(token, voiceId);
      if (voice === voiceId) setVoice("en-emma_woman");
      await refreshVoices();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-2">
          TEXT TO SPEECH
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg">
          Generate expressive audio with next-gen AI. Zero-shot cloning supported.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
        <div className="glass-panel p-6 rounded-2xl border border-border/50 shadow-xl flex flex-col">
          <label className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-accent mb-3">
            <Zap size={14} /> Input Text
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            maxLength={4000}
            className="w-full flex-1 bg-panel-2/50 border border-border/50 rounded-xl p-4 font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all resize-none"
            placeholder="Enter text to synthesize..."
          />
          <div className="flex flex-wrap gap-2 mt-4">
            {EXAMPLES.map(([label, value]) => (
              <button
                key={label}
                onClick={() => setText(value)}
                className="text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg border border-border/50 bg-panel-2/30 text-muted hover:text-accent hover:border-accent/50 hover:bg-accent/10 transition-all"
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-[10px] font-mono text-muted/50 self-center">
              {text.length} / 4000 CHARS
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl border border-border/50 shadow-xl">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-3">
              Voice Model
            </label>
            <Select
              value={voice}
              onChange={setVoice}
              placeholder="Choose a voice…"
              groups={groupedVoices.map<SelectGroup>(({ label, list }) => ({
                label,
                options: list.map((v) => ({
                  value: v.id,
                  label: v.stem,
                  meta: v.id,
                  badge:
                    v.user
                      ? "★"
                      : v.language === "hi" || v.id.startsWith("hi-")
                      ? "🇮🇳"
                      : undefined,
                })),
              }))}
            />
            {voices.find((v) => v.id === voice)?.user && (
              <button
                onClick={() => deleteVoice(voice)}
                className="mt-3 text-[10px] font-mono uppercase tracking-widest text-err/70 hover:text-err flex items-center gap-1.5 transition-colors p-2 hover:bg-err/10 rounded-lg w-full justify-center"
              >
                <Trash2 size={12} /> Purge Voice Model
              </button>
            )}
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-border/50 shadow-xl">
            <div className="flex justify-between items-center mb-3">
              <label className="block text-[10px] font-mono uppercase tracking-widest text-muted">
                CFG Scale
              </label>
              <span className="text-xs font-mono font-bold text-accent">{cfg.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min={0.5}
              max={3.0}
              step={0.1}
              value={cfg}
              onChange={(e) => setCfg(parseFloat(e.target.value))}
              className="w-full h-2 bg-panel-2 rounded-lg appearance-none cursor-pointer accent-accent"
            />
            <div className="flex justify-between text-[9px] font-mono text-muted/50 mt-2">
              <span>0.5</span>
              <span>1.5</span>
              <span>3.0</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row items-center gap-4">
        <button
          onClick={generate}
          disabled={loading || !text.trim() || !voice}
          className="w-full sm:w-auto bg-gradient-to-r from-accent to-accent-2 text-white disabled:from-panel-2 disabled:to-panel-2 disabled:text-muted/50 px-8 py-3.5 rounded-xl font-bold tracking-widest flex items-center justify-center gap-3 hover:shadow-[0_0_20px_rgba(255,42,95,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group"
        >
          {loading ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Play size={18} className="fill-current group-hover:scale-110 transition-transform" />
          )}
          {loading ? "SYNTHESIZING..." : "GENERATE AUDIO"}
        </button>
        {error && <span className="text-err text-xs font-mono font-bold bg-err/10 px-3 py-2 rounded-lg border border-err/20">{error}</span>}
        {meta && !error && (
          <span className="text-muted/70 text-[10px] font-mono font-bold px-4 py-2 glass-panel rounded-lg border border-border/50">
            SPEED: <span className="text-ok">{(meta.ms / 1000).toFixed(2)}S</span> <span className="mx-2">|</span> SIZE: <span className="text-accent-2">{(meta.bytes / 1024).toFixed(1)} KB</span>
          </span>
        )}
      </div>

      {audioUrl && (
        <div className="mt-8 glass-panel p-6 rounded-2xl border border-ok/30 shadow-[0_0_20px_rgba(0,230,118,0.1)] animate-fade-in relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 bg-ok h-full shadow-[0_0_10px_#00e676]" />
          <div className="text-[10px] font-mono uppercase tracking-widest text-ok mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
            Synthesis Complete
          </div>
          <audio controls src={audioUrl} className="w-full h-12 rounded-lg" />
          <a
            href={audioUrl}
            download="vaani-synth.wav"
            className="inline-flex items-center gap-2 text-[10px] font-mono font-bold text-panel bg-ok hover:bg-ok/90 px-4 py-2 rounded-lg mt-4 transition-colors uppercase tracking-widest"
          >
            <Download size={14} /> Download WAV
          </a>
        </div>
      )}

      {/* Voice upload (auth required) */}
      <div className="mt-12 glass-panel p-8 rounded-2xl border border-border/50 relative overflow-hidden group">
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-accent/5 rounded-full blur-[80px] pointer-events-none group-hover:bg-accent/10 transition-colors" />
        
        <div className="flex items-start gap-4 mb-6 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center border border-accent/20">
            <Upload size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="text-lg font-display font-bold tracking-wide">CLONE NEURAL VOICE</h2>
            <p className="text-xs text-muted/80 mt-1 font-medium max-w-lg">
              Upload a pristine audio sample (3–30s, single speaker, 24kHz mono recommended). The system will extract the vocal footprint.
            </p>
          </div>
        </div>

        {!token ? (
          <div className="bg-panel-2/50 border border-border/50 rounded-xl p-4 text-center">
            <p className="text-sm font-medium text-muted">
              Authentication required to access cloning matrix.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-[1fr,1.5fr,auto] relative z-10">
            <input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Designation (e.g. ghost-01)"
              maxLength={40}
              className="bg-panel-2/80 border border-border/50 rounded-xl p-3 text-sm font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-muted/40"
            />
            <div className="relative">
              <input
                ref={fileRef}
                type="file"
                accept=".wav,audio/wav,audio/x-wav"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              />
              <div className="h-full bg-panel-2/80 border border-border/50 border-dashed hover:border-accent/50 rounded-xl p-3 flex items-center gap-3 text-sm transition-colors overflow-hidden">
                <div className="px-3 py-1 bg-panel text-[10px] font-mono rounded uppercase tracking-wider text-muted font-bold">
                  Select File
                </div>
                <span className="text-muted truncate font-medium">
                  {uploadFile ? uploadFile.name : "No file chosen"}
                </span>
              </div>
            </div>
            <button
              onClick={uploadVoice}
              disabled={uploading || !uploadName.trim() || !uploadFile}
              className="bg-accent hover:bg-accent-hover text-white disabled:bg-panel-2 disabled:text-muted/50 px-6 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 transition-all disabled:hover:scale-100 active:scale-95 uppercase text-sm"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {uploading ? "UPLOADING..." : "UPLOAD"}
            </button>
          </div>
        )}
        {uploadError && (
          <div className="mt-4 text-err text-xs font-mono bg-err/10 border border-err/20 p-3 rounded-lg inline-block">
            ERROR: {uploadError}
          </div>
        )}
      </div>
    </div>
  );
}
