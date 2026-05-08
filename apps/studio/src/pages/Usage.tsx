import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, CreditCard, Loader2, ShoppingCart } from "lucide-react";
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
      // Refresh balance from /me
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

  // After Cashfree returns to /usage?order_id=..., poll for a few seconds
  // so the webhook has time to land and credit the account.
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
      // Whether modal closed by completion, drop, or X, refresh state.
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBuying(null);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Usage & Credits</h1>
      <p className="text-muted mt-1">
        Top up credits to keep generating speech and transcripts.
      </p>

      {returnedOrder && (
        <div className="mt-4 p-3 border border-accent rounded-lg flex items-center gap-2 text-sm">
          <Loader2 size={14} className="animate-spin text-accent" />
          Confirming payment for <code className="font-mono text-xs">{returnedOrder}</code>…
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="p-5 bg-panel border border-border rounded-xl">
          <div className="text-xs uppercase tracking-wide text-muted">Credits</div>
          <div className="text-3xl font-semibold mt-2">{credits.toLocaleString()}</div>
          <div className="text-xs text-muted mt-1">available balance</div>
        </div>
        <div className="p-5 bg-panel border border-border rounded-xl">
          <div className="text-xs uppercase tracking-wide text-muted">Lifetime spend</div>
          <div className="text-3xl font-semibold mt-2">
            ₹{history.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount_inr, 0).toLocaleString()}
          </div>
          <div className="text-xs text-muted mt-1">{history.filter((p) => p.status === "PAID").length} purchases</div>
        </div>
        <div className="p-5 bg-panel border border-border rounded-xl">
          <div className="text-xs uppercase tracking-wide text-muted">Mode</div>
          <div className="text-3xl font-semibold mt-2">{CASHFREE_MODE === "production" ? "Live" : "Sandbox"}</div>
          <div className="text-xs text-muted mt-1">payments via Cashfree</div>
        </div>
      </div>

      <h2 className="mt-10 text-sm uppercase tracking-wide text-muted">Top up</h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {loading && pkgs.length === 0 ? (
          <div className="col-span-3 text-muted text-sm flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Loading packages…
          </div>
        ) : (
          pkgs.map((p) => (
            <div
              key={p.id}
              className="p-5 bg-panel border border-border rounded-xl flex flex-col"
            >
              <div className="text-sm uppercase tracking-wide text-muted">
                {p.label}
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <div className="text-3xl font-semibold">₹{p.amount_inr.toLocaleString()}</div>
              </div>
              <div className="text-sm text-muted mt-1">
                {p.credits.toLocaleString()} credits
              </div>
              <div className="text-xs text-muted mt-1">
                ≈ ₹{(p.amount_inr / p.credits * 1000).toFixed(2)} per 1k credits
              </div>
              <button
                onClick={() => buy(p)}
                disabled={buying !== null}
                className="mt-4 bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-accent-2"
              >
                {buying === p.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ShoppingCart size={14} />
                )}
                Buy
              </button>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mt-6 p-3 border border-err rounded-lg text-err text-sm">
          {error}
        </div>
      )}

      <h2 className="mt-10 text-sm uppercase tracking-wide text-muted">Recent payments</h2>
      <div className="mt-3 space-y-2">
        {history.length === 0 ? (
          <div className="p-8 bg-panel border border-border rounded-xl flex flex-col items-center text-center">
            <div className="w-10 h-10 rounded-full bg-panel-2 flex items-center justify-center">
              <CreditCard size={16} className="text-muted" />
            </div>
            <p className="mt-3 text-sm text-muted">No purchases yet.</p>
          </div>
        ) : (
          history.map((p) => (
            <div
              key={p.order_id}
              className="p-4 bg-panel border border-border rounded-xl flex items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {pkgs.find((x) => x.id === p.package_id)?.label || p.package_id}
                </div>
                <div className="text-xs text-muted font-mono mt-0.5 truncate">
                  {p.order_id}
                </div>
                <div className="text-xs text-muted mt-1">
                  {new Date(p.created_at).toLocaleString()}
                  {p.paid_at && ` · paid ${new Date(p.paid_at).toLocaleTimeString()}`}
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">₹{p.amount_inr.toLocaleString()}</div>
                <div
                  className={`text-xs mt-0.5 ${
                    p.status === "PAID"
                      ? "text-ok"
                      : p.status === "FAILED"
                      ? "text-err"
                      : "text-muted"
                  }`}
                >
                  {p.status === "PAID" && (
                    <CheckCircle2 size={12} className="inline mr-1 -mt-0.5" />
                  )}
                  {p.status}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
