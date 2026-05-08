import { useState } from "react";
import { Loader2, Upload, AudioLines, Play } from "lucide-react";
import { api } from "../lib/api";

export function STT() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function transcribe() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setTranscript(null);
    try {
      const out = await api.transcribe(file);
      setTranscript(out.text);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-[#00e676] to-[#00b0ff]">
          SPEECH TO TEXT
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg">
          VibeVoice-ASR-7B · Diarization, timestamps, and 50+ languages in a single pass.
        </p>
      </div>

      <div className="glass-panel p-8 rounded-3xl border border-border/50 shadow-xl relative overflow-hidden group transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00e676]/5 to-[#00b0ff]/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        
        <label
          htmlFor="audio-file"
          className={`
            relative z-10 flex flex-col items-center justify-center gap-4 p-12 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300
            ${file ? 'border-[#00e676]/50 bg-[#00e676]/5' : 'border-border hover:border-[#00e676]/50 hover:bg-[#00e676]/5'}
          `}
        >
          {file ? (
            <div className="w-16 h-16 rounded-full bg-[#00e676]/20 flex items-center justify-center border border-[#00e676]/30 mb-2 shadow-[0_0_15px_rgba(0,230,118,0.3)] animate-pulse">
              <AudioLines size={32} className="text-[#00e676]" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-panel-2 flex items-center justify-center border border-border group-hover:scale-110 transition-transform duration-500">
              <Upload size={28} className="text-muted group-hover:text-[#00e676] transition-colors" />
            </div>
          )}
          
          <div className="text-center">
            {file ? (
              <div className="flex flex-col items-center">
                <span className="text-lg font-bold text-[#00e676]">{file.name}</span>
                <span className="text-[10px] font-mono text-[#00e676]/70 mt-1 uppercase tracking-widest">
                  AUDIO PAYLOAD · {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            ) : (
              <>
                <span className="text-lg font-bold">CLICK TO UPLOAD</span>
                <p className="text-sm font-medium text-muted mt-1">or drag and drop a wav/mp3/m4a</p>
              </>
            )}
          </div>
        </label>
        
        <input
          id="audio-file"
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-4 relative z-10">
          <button
            onClick={transcribe}
            disabled={!file || loading}
            className="w-full sm:w-auto bg-gradient-to-r from-[#00e676] to-[#00b0ff] text-panel disabled:from-panel-2 disabled:to-panel-2 disabled:text-muted/50 px-8 py-3.5 rounded-xl font-bold tracking-widest flex items-center justify-center gap-3 hover:shadow-[0_0_20px_rgba(0,230,118,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 group/btn"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin text-panel" />
            ) : (
              <Play size={18} className="fill-current group-hover/btn:scale-110 transition-transform" />
            )}
            {loading ? "DECODING..." : "TRANSCRIBE"}
          </button>
          {error && <span className="text-err text-xs font-mono font-bold bg-err/10 px-3 py-2 rounded-lg border border-err/20">ERROR: {error}</span>}
        </div>
      </div>

      {transcript && (
        <div className="mt-8 glass-panel p-8 rounded-3xl border border-[#00b0ff]/30 shadow-[0_0_30px_rgba(0,176,255,0.1)] relative overflow-hidden animate-slide-up">
          <div className="absolute top-0 left-0 w-1 bg-gradient-to-b from-[#00e676] to-[#00b0ff] h-full shadow-[0_0_10px_#00b0ff]" />
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#00b0ff] mb-6 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00b0ff] animate-pulse" />
            Transcription Output Matrix
          </div>
          <div className="prose prose-invert max-w-none">
            <p className="whitespace-pre-wrap leading-relaxed text-lg font-medium text-text/90">
              {transcript}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 p-5 bg-panel-2/50 border border-border/50 rounded-xl text-xs text-muted/80 font-mono leading-relaxed">
        <span className="text-accent-2 font-bold">SYSTEM NOTE:</span> STT endpoint is wired to <code>/v1/audio/transcriptions</code>. The backend route
        is part of the active Week-2 sprint — if you see a 404, that just means the route
        isn't deployed yet. Upload still works and the API call will succeed once the
        route lands.
      </div>
    </div>
  );
}
