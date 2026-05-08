import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Play, Download, Upload, Trash2 } from "lucide-react";
import { api, voicesApi, type Voice } from "../lib/api";
import { useAuth } from "../lib/auth";

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
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Text to Speech</h1>
      <p className="text-muted mt-1">
        VibeVoice for English &amp; multilingual presets · vibevoice-hindi-1.5B for Hindi · zero-shot cloning for your own voices.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div>
          <label className="block text-xs uppercase tracking-wide text-muted mb-2">Text</label>
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
            <span className="ml-auto text-xs text-muted self-center">{text.length} / 4000</span>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-2">Voice</label>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              className="w-full bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent"
            >
              {groupedVoices.map(({ label, list }) => (
                <optgroup key={label} label={label}>
                  {list.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.stem}
                      {v.language === "hi" ? " 🇮🇳" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {voices.find((v) => v.id === voice)?.user && (
              <button
                onClick={() => deleteVoice(voice)}
                className="mt-2 text-xs text-muted hover:text-err inline-flex items-center gap-1"
              >
                <Trash2 size={12} /> Delete this voice
              </button>
            )}
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

      {/* Voice upload (auth required) */}
      <div className="mt-10 p-5 bg-panel border border-border rounded-xl">
        <div className="flex items-center gap-3">
          <Upload size={18} className="text-accent" />
          <div>
            <h2 className="font-semibold">Clone your voice</h2>
            <p className="text-sm text-muted mt-0.5">
              Upload a clean .wav (3–30 s, single speaker, 24 kHz mono recommended). It will appear in MY VOICES.
            </p>
          </div>
        </div>
        {!token ? (
          <p className="mt-4 text-sm text-muted">
            Sign in to upload your own voices.
          </p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-[2fr,3fr,auto]">
            <input
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="Voice name (e.g. my-voice)"
              maxLength={40}
              className="bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent"
            />
            <input
              ref={fileRef}
              type="file"
              accept=".wav,audio/wav,audio/x-wav"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="text-sm text-muted file:mr-3 file:px-3 file:py-2 file:rounded-md file:border file:border-border file:bg-panel-2 file:text-text"
            />
            <button
              onClick={uploadVoice}
              disabled={uploading || !uploadName.trim() || !uploadFile}
              className="bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] px-4 rounded-lg font-medium flex items-center gap-2 hover:bg-accent-2"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload
            </button>
          </div>
        )}
        {uploadError && (
          <div className="mt-3 text-err text-sm">{uploadError}</div>
        )}
      </div>
    </div>
  );
}
