import { useEffect, useState } from "react";
import { Copy, Loader2, KeyRound, Plus, Trash2 } from "lucide-react";
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
    if (!confirm("Revoke this key? This can't be undone.")) return;
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
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-muted mt-1">
            Use server-side keys to call the API from your code. Treat them like passwords.
          </p>
        </div>
      </div>

      {justCreated?.key && (
        <div className="mt-6 p-5 bg-panel border border-accent rounded-xl">
          <div className="text-sm font-medium text-accent">Your new key — copy it now</div>
          <p className="text-xs text-muted mt-1">
            We can't show it again. Store it in your secrets manager.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-panel-2 border border-border rounded-lg text-sm font-mono break-all">
              {justCreated.key}
            </code>
            <button
              onClick={() => copy(justCreated.key!)}
              className="px-3 py-2 bg-accent text-[#1a1300] rounded-lg text-sm font-medium hover:bg-accent-2 flex items-center gap-2"
            >
              <Copy size={14} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setJustCreated(null)}
            className="mt-3 text-xs text-muted hover:text-text"
          >
            I've saved it — dismiss
          </button>
        </div>
      )}

      <form onSubmit={create} className="mt-6 p-5 bg-panel border border-border rounded-xl">
        <div className="text-xs uppercase tracking-wide text-muted mb-2">Create a new key</div>
        <div className="flex gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. production-server, my-laptop, ci"
            maxLength={80}
            className="flex-1 bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newName.trim() || creating}
            className="bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] px-4 rounded-lg font-medium flex items-center gap-2 hover:bg-accent-2"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 p-3 border border-err rounded-lg text-err text-sm">{error}</div>
      )}

      <h2 className="mt-8 text-sm uppercase tracking-wide text-muted">Active</h2>
      {loading ? (
        <div className="mt-3 text-muted text-sm flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : active.length === 0 ? (
        <div className="mt-3 p-8 bg-panel border border-border rounded-xl flex flex-col items-center text-center">
          <div className="w-10 h-10 rounded-full bg-panel-2 flex items-center justify-center">
            <KeyRound size={16} className="text-muted" />
          </div>
          <p className="mt-3 text-sm text-muted">No keys yet. Create one above to start calling the API.</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {active.map((k) => (
            <KeyRow key={k.id} k={k} onRevoke={() => revoke(k.id)} />
          ))}
        </div>
      )}

      {revoked.length > 0 && (
        <>
          <h2 className="mt-8 text-sm uppercase tracking-wide text-muted">Revoked</h2>
          <div className="mt-3 space-y-2 opacity-60">
            {revoked.map((k) => (
              <KeyRow key={k.id} k={k} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function KeyRow({ k, onRevoke }: { k: ApiKey; onRevoke?: () => void }) {
  return (
    <div className="p-4 bg-panel border border-border rounded-xl flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{k.name}</div>
        <div className="text-xs text-muted font-mono mt-0.5 truncate">{k.display}</div>
        <div className="text-xs text-muted mt-1">
          Created {new Date(k.created_at).toLocaleDateString()}
          {k.last_used_at && ` · last used ${new Date(k.last_used_at).toLocaleString()}`}
          {k.revoked_at && ` · revoked ${new Date(k.revoked_at).toLocaleDateString()}`}
        </div>
      </div>
      {onRevoke && (
        <button
          onClick={onRevoke}
          className="p-2 rounded-md hover:bg-panel-2 text-muted hover:text-err"
          title="Revoke"
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
