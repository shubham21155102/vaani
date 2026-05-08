import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
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
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Speech to Text</h1>
      <p className="text-muted mt-1">
        VibeVoice-ASR-7B · 50+ languages, diarization, 60-min single-pass.
      </p>

      <div className="mt-6 p-6 bg-panel border border-border rounded-xl">
        <label
          htmlFor="audio-file"
          className="flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-accent transition-colors"
        >
          <Upload size={32} className="text-muted" />
          <div className="text-sm">
            {file ? (
              <span className="text-text">{file.name}</span>
            ) : (
              <>
                <span className="text-text font-medium">Click to upload</span>{" "}
                <span className="text-muted">or drop a wav/mp3/m4a</span>
              </>
            )}
          </div>
          {file && (
            <span className="text-xs text-muted">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
          )}
        </label>
        <input
          id="audio-file"
          type="file"
          accept="audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="hidden"
        />
        <div className="mt-5 flex items-center gap-4">
          <button
            onClick={transcribe}
            disabled={!file || loading}
            className="bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] px-5 py-2.5 rounded-lg font-medium flex items-center gap-2 hover:bg-accent-2 transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Transcribing…" : "Transcribe"}
          </button>
          {error && <span className="text-err text-sm">{error}</span>}
        </div>
      </div>

      {transcript && (
        <div className="mt-6 p-5 bg-panel border border-border rounded-xl">
          <div className="text-xs uppercase tracking-wide text-muted mb-3">Transcript</div>
          <p className="whitespace-pre-wrap leading-relaxed">{transcript}</p>
        </div>
      )}

      <div className="mt-6 p-4 bg-panel-2 border border-border rounded-lg text-xs text-muted">
        STT endpoint is wired to <code>/v1/audio/transcriptions</code>. The backend route
        is part of the active Week-2 sprint — if you see a 404, that just means the route
        isn't deployed yet. Upload still works and the API call will succeed once the
        route lands.
      </div>
    </div>
  );
}
