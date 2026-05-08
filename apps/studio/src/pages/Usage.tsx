import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Loader2, ShoppingCart, Zap } from "lucide-react";
import {
  billingApi,
  type Package,
  type Payment,
  API_BASE,
} from "../lib/api";
import { useAuth } from "../lib/auth";

declare global {
  interface Window {
    Cashfree?: (config: { mode: "sandbox" | "production" }) => {
      checkout: (opts: {
        paymentSessionId: string;
        redirectTarget?: "_self" | "_blank" | "_modal";
      }) => Promise<{
        error?: { code?: string; message?: string };
        redirect?: boolean;
        paymentDetails?: { paymentMessage?: string };
      }>;
    };
  }
}

const CASHFREE_MODE =
  (import.meta.env.VITE_CASHFREE_MODE as "sandbox" | "production" | undefined) ||
  "production";

export function Usage() {
  const { user, token } = useAuth();
  const [pkgs, setPkgs] = useState<Package[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number>(user?.credits ?? 0);
  const [params, setParams] = useSearchParams();
  const returnedOrder = params.get("order_id");

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const [{ packages }, { payments }] = await Promise.all([
        billingApi.packages(),
        billingApi.payments(token),
      ]);
      setPkgs(packages);
      setHistory(payments);
      const me = await fetch(`${API_BASE}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((r) => r.json());
      if (me?.user?.credits !== undefined) setCredits(me.user.credits);
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

  useEffect(() => {
    if (!returnedOrder || !token) return;
    let n = 0;
    const id = setInterval(async () => {
      n += 1;
      await refresh();
      const found = history.find((p) => p.order_id === returnedOrder);
      if (n > 8 || found?.status === "PAID") {
        clearInterval(id);
        params.delete("order_id");
        setParams(params, { replace: true });
      }
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returnedOrder, token]);

  async function buy(pkg: Package) {
    if (!token) return;
    setBuying(pkg.id);
    setError(null);
    try {
      const out = await billingApi.checkout(token, pkg.id);
      if (!window.Cashfree) {
        throw new Error("Cashfree SDK didn't load. Try refreshing.");
      }
      const cf = window.Cashfree({ mode: CASHFREE_MODE });
      const result = await cf.checkout({
        paymentSessionId: out.payment_session_id,
        redirectTarget: "_modal",
      });
      if (result.error) {
        setError(result.error.message || "Payment failed.");
      }
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="animate-fade-in pb-12">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-2">
          RESOURCE ALLOCATION
        </h1>
        <p className="text-muted/80 mt-2 font-medium text-lg flex items-center gap-2">
          <Zap size={18} className="text-accent-2" />
          Manage compute credits for synthesis and transcription operations.
        </p>
      </div>

      {returnedOrder && (
        <div className="mb-6 p-4 glass-panel border border-accent rounded-xl flex items-center gap-3 text-sm font-mono text-accent shadow-[0_0_15px_rgba(255,42,95,0.2)]">
          <Loader2 size={16} className="animate-spin text-accent" />
          <span>VERIFYING TRANSACTION <code className="text-white ml-2">{returnedOrder}</code>...</span>
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-3 mb-12">
        <div className="glass-panel p-6 border border-accent/30 rounded-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-accent/5 opacity-50 group-hover:opacity-100 transition-opacity" />
          <div className="absolute top-0 left-0 w-1 bg-accent h-full shadow-[0_0_10px_#ff2a5f]" />
          <div className="relative z-10">
            <div className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2">Available Compute</div>
            <div className="text-4xl font-black font-display text-text drop-shadow-[0_0_10px_rgba(255,255,255,0.2)] tracking-tighter">
              {credits.toLocaleString()}
            </div>
            <div className="text-xs text-muted font-medium mt-1">TOTAL CREDITS</div>
          </div>
        </div>
        
        <div className="glass-panel p-6 border border-border/50 rounded-2xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-2">Total Capital Infused</div>
            <div className="text-4xl font-black font-display text-text tracking-tighter">
              ₹{history.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount_inr, 0).toLocaleString()}
            </div>
            <div className="text-xs text-muted font-medium mt-1">ACROSS {history.filter((p) => p.status === "PAID").length} TRANSACTIONS</div>
          </div>
        </div>
        
        <div className="glass-panel p-6 border border-border/50 rounded-2xl relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[10px] font-mono uppercase tracking-widest text-muted mb-2">Gateway Status</div>
            <div className="text-4xl font-black font-display text-text tracking-tighter uppercase">
              {CASHFREE_MODE === "production" ? "LIVE" : "TEST"}
            </div>
            <div className="text-xs text-muted font-medium mt-1">CASHFREE NETWORK</div>
          </div>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="text-lg font-display font-bold tracking-widest mb-6 flex items-center gap-3">
          ACQUIRE RESOURCES
          <div className="flex-1 h-px bg-gradient-to-r from-border/80 to-transparent" />
        </h2>
        
        <div className="grid gap-6 sm:grid-cols-3">
          {loading && pkgs.length === 0 ? (
            <div className="col-span-3 text-accent font-mono text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Loading Packages...
            </div>
          ) : (
            pkgs.map((p) => (
              <div
                key={p.id}
                className="glass-panel p-6 border border-border/50 hover:border-accent/50 hover:shadow-[0_0_20px_rgba(255,42,95,0.15)] rounded-2xl flex flex-col transition-all duration-300 group"
              >
                <div className="text-[10px] font-mono uppercase tracking-widest text-muted group-hover:text-accent transition-colors">
                  {p.label}
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <div className="text-3xl font-display font-black tracking-tighter">₹{p.amount_inr.toLocaleString()}</div>
                </div>
                <div className="text-sm font-bold text-accent-2 mt-2 font-mono">
                  +{p.credits.toLocaleString()} CREDITS
                </div>
                <div className="text-[10px] text-muted/60 mt-1 font-mono uppercase tracking-wider">
                  ≈ ₹{(p.amount_inr / p.credits * 1000).toFixed(2)} / 1K
                </div>
                <button
                  onClick={() => buy(p)}
                  disabled={buying !== null}
                  className="mt-6 bg-panel-2/80 border border-border/50 text-text group-hover:bg-gradient-to-r group-hover:from-accent group-hover:to-accent-2 group-hover:text-white group-hover:border-transparent disabled:opacity-50 py-3 rounded-xl font-bold tracking-widest flex items-center justify-center gap-2 transition-all uppercase text-sm"
                >
                  {buying === p.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ShoppingCart size={16} className="group-hover:scale-110 transition-transform" />
                  )}
                  {buying === p.id ? "PROCESSING..." : "PURCHASE"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-err/10 border border-err/30 rounded-xl text-err text-[10px] font-mono uppercase font-bold">
          TRANSACTION ERROR: {error}
        </div>
      )}

      <div>
        <h2 className="text-lg font-display font-bold tracking-widest mb-6 flex items-center gap-3">
          TRANSACTION LEDGER
          <div className="flex-1 h-px bg-gradient-to-r from-border/80 to-transparent" />
        </h2>
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="p-12 glass-panel border border-border/50 rounded-2xl flex flex-col items-center text-center opacity-80">
              <div className="w-16 h-16 rounded-2xl bg-panel-2/80 border border-border/50 flex items-center justify-center mb-4">
                <CreditCard size={28} className="text-muted" />
              </div>
              <p className="text-sm text-muted font-medium">Ledger is empty.</p>
            </div>
          ) : (
            history.map((p) => (
              <div
                key={p.order_id}
                className="glass-panel p-5 border border-border/50 rounded-xl flex items-center gap-4 hover:bg-panel-2/30 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-bold tracking-wide text-text/90">
                    {pkgs.find((x) => x.id === p.package_id)?.label || p.package_id}
                  </div>
                  <div className="text-[10px] text-muted/60 font-mono mt-1 mb-2 bg-panel-2 px-2 py-0.5 rounded inline-block truncate max-w-full">
                    ID: {p.order_id}
                  </div>
                  <div className="text-[10px] font-mono text-muted/60 uppercase tracking-widest flex gap-4">
                    <span>INIT: {new Date(p.created_at).toLocaleString()}</span>
                    {p.paid_at && <span className="text-text/70">SETTLED: {new Date(p.paid_at).toLocaleTimeString()}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-display font-bold text-lg tracking-tight">₹{p.amount_inr.toLocaleString()}</div>
                  <div
                    className={`text-[10px] font-mono font-bold uppercase tracking-widest mt-1 flex items-center justify-end gap-1 ${
                      p.status === "PAID"
                        ? "text-ok"
                        : p.status === "FAILED"
                        ? "text-err"
                        : "text-muted"
                    }`}
                  >
                    {p.status === "PAID" && <CheckCircle2 size={12} />}
                    {p.status}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
