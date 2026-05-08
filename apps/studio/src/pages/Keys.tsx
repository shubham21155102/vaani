import { useEffect, useState } from "react";
import { Copy, Loader2, KeyRound, Plus, Trash2, Zap } from "lucide-react";
import { keysApi, type ApiKey } from "../lib/api";
import { useAuth } from "../lib/auth";

export function Keys() {
  const { token } = useAuth();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [justCreated, setJustCreated] = useState<ApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const r = await keysApi.list(token);
      setKeys(r.keys);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const k = await keysApi.create(token, newName.trim());
      setJustCreated(k);
      setNewName("");
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: number) {
    if (!token) return;
    if (!confirm("REVOKE CREDENTIAL? This action cannot be reversed.")) return;
    try {
      await keysApi.revoke(token, id);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function copy(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  const active = keys.filter((k) => !k.revoked_at);
  const revoked = keys.filter((k) => k.revoked_at);

  return (
    <div className="animate-fade-in pb-12">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-2">
          SECURITY CREDENTIALS
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg flex items-center gap-2">
          <KeyRound size={18} className="text-accent" />
          Server-side API keys. Treat these with extreme prejudice.
        </p>
      </div>

      {justCreated?.key && (
        <div className="mt-8 glass-panel p-8 rounded-2xl border border-ok/50 shadow-[0_0_30px_rgba(0,230,118,0.15)] relative overflow-hidden animate-slide-up">
          <div className="absolute top-0 left-0 w-1 bg-ok h-full shadow-[0_0_10px_#00e676]" />
          <div className="text-[10px] font-mono uppercase tracking-widest text-ok mb-4 flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
            NEW CREDENTIAL GENERATED
          </div>
          <p className="text-sm font-medium text-text/90 mb-4">
            This key will only be displayed once. Copy it to your secure vault immediately.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <code className="flex-1 px-4 py-3 bg-panel-2/80 border border-ok/30 rounded-xl text-sm font-mono text-ok break-all">
              {justCreated.key}
            </code>
            <button
              onClick={() => copy(justCreated.key!)}
              className="bg-ok hover:bg-ok/90 text-panel px-6 py-3 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 transition-all uppercase whitespace-nowrap"
            >
              {copied ? (
                <>Copied to Clipboard</>
              ) : (
                <><Copy size={16} /> Copy Credential</>
              )}
            </button>
          </div>
          <button
            onClick={() => setJustCreated(null)}
            className="mt-6 text-[10px] font-mono uppercase tracking-widest text-muted hover:text-text transition-colors underline decoration-border underline-offset-4 hover:decoration-text"
          >
            Acknowledge & Dismiss
          </button>
        </div>
      )}

      <form onSubmit={create} className="mt-8 glass-panel p-6 rounded-2xl border border-border/50 shadow-xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-r from-accent/5 to-accent-2/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        <div className="text-[10px] font-mono uppercase tracking-widest text-accent mb-4 flex items-center gap-2 relative z-10">
          <Zap size={14} /> Forge New Key
        </div>
        <div className="flex flex-col sm:flex-row gap-4 relative z-10">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Designation (e.g. prod-server-01)"
            maxLength={80}
            className="flex-1 bg-panel-2/80 border border-border/50 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-muted/40"
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="bg-gradient-to-r from-accent to-accent-2 text-white disabled:from-panel-2 disabled:to-panel-2 disabled:text-muted/50 px-8 py-3.5 rounded-xl font-bold tracking-widest flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,42,95,0.4)] transition-all uppercase disabled:shadow-none hover:scale-[1.02] active:scale-[0.98] disabled:hover:scale-100"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {creating ? "FORGING..." : "FORGE"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-6 p-4 bg-err/10 border border-err/30 rounded-xl text-err text-[10px] font-mono uppercase font-bold">
          ERROR: {error}
        </div>
      )}

      <div className="mt-12">
        <h2 className="text-lg font-display font-bold tracking-widest mb-6 flex items-center gap-3">
          ACTIVE CREDENTIALS
          <div className="flex-1 h-px bg-gradient-to-r from-border/80 to-transparent" />
        </h2>
        
        {loading ? (
          <div className="flex items-center gap-3 text-accent font-mono text-sm font-bold uppercase tracking-widest">
            <Loader2 size={16} className="animate-spin" /> Retrieving data...
          </div>
        ) : active.length === 0 ? (
          <div className="p-12 glass-panel border border-border/50 rounded-2xl flex flex-col items-center text-center opacity-80">
            <div className="w-16 h-16 rounded-2xl bg-panel-2/80 border border-border/50 flex items-center justify-center mb-4">
              <KeyRound size={28} className="text-muted" />
            </div>
            <p className="text-sm text-muted font-medium">No active credentials found. Forge one above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {active.map((k) => (
              <KeyRow key={k.id} k={k} onRevoke={() => revoke(k.id)} />
            ))}
          </div>
        )}
      </div>

      {revoked.length > 0 && (
        <div className="mt-12">
          <h2 className="text-lg font-display font-bold tracking-widest mb-6 flex items-center gap-3 opacity-50">
            REVOKED CREDENTIALS
            <div className="flex-1 h-px bg-gradient-to-r from-border/50 to-transparent" />
          </h2>
          <div className="space-y-4 opacity-50 grayscale">
            {revoked.map((k) => (
              <KeyRow key={k.id} k={k} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KeyRow({ k, onRevoke }: { k: ApiKey; onRevoke?: () => void }) {
  return (
    <div className="glass-panel p-5 border border-border/50 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-accent/30 transition-colors relative overflow-hidden">
      {onRevoke && (
        <div className="absolute top-0 left-0 w-1 bg-accent/50 h-full opacity-0 group-hover:opacity-100 transition-opacity" />
      )}
      
      <div className="flex-1 min-w-0">
        <div className="font-bold tracking-wide text-text/90 truncate text-lg">
          {k.name}
        </div>
        <div className="text-xs text-accent font-mono mt-1 mb-3 bg-accent/10 px-2 py-0.5 rounded inline-block truncate max-w-full border border-accent/20">
          {k.display}
        </div>
        
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono text-muted/60 uppercase tracking-widest">
          <span>FORGED: {new Date(k.created_at).toISOString().split('T')[0]}</span>
          {k.last_used_at && (
            <span><span className="text-ok">LAST PING:</span> {new Date(k.last_used_at).toISOString().replace('T', ' ').substring(0, 16)}</span>
          )}
          {k.revoked_at && (
            <span className="text-err">TERMINATED: {new Date(k.revoked_at).toISOString().split('T')[0]}</span>
          )}
        </div>
      </div>
      
      {onRevoke && (
        <button
          onClick={onRevoke}
          className="shrink-0 p-3 rounded-xl bg-panel-2/50 border border-border/50 hover:bg-err/10 hover:border-err/30 text-muted hover:text-err transition-all self-end sm:self-center"
          title="Revoke Credential"
        >
          <Trash2 size={18} />
        </button>
      )}
    </div>
  );
}
