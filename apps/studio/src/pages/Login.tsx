import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight } from "lucide-react";
import { hasGoogleClientId, mountGoogleButton, useAuth } from "../lib/auth";

export function Login() {
  const { user, loginEmail, loginGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const next = (location.state as { from?: string } | null)?.from || "/";
  const gbtn = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate(next, { replace: true });
  }, [user, navigate, next]);

  useEffect(() => {
    if (!gbtn.current) return;
    mountGoogleButton(gbtn.current, async (credential) => {
      setError(null);
      try {
        await loginGoogle(credential);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, "signin_with").catch((e) => setError(e.message));
  }, [loginGoogle]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginEmail(email, password);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-2/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <Link to="/" className="flex items-center gap-3 mb-10 justify-center group">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-accent shadow-[0_0_10px_#ff2a5f]"></span>
          </span>
          <span className="font-display font-black tracking-widest text-2xl group-hover:text-glow transition-all">VAANI</span>
        </Link>

        <div className="glass-panel p-8 sm:p-10 rounded-3xl border border-border/50 shadow-2xl backdrop-blur-xl">
          <h1 className="text-3xl font-display font-bold tracking-tight text-center mb-2">
            WELCOME BACK
          </h1>
          <p className="text-muted/80 text-center mb-8 font-medium">
            Sign in to access your neural interface
          </p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-2 ml-1">
                Email Address
              </label>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-panel-2/50 border border-border/50 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-muted/30"
                placeholder="system@vaani.ai"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-2 ml-1">
                Security Key
              </label>
              <input
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-panel-2/50 border border-border/50 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-muted/30"
                placeholder="••••••••"
              />
            </div>
            
            {error && (
              <div className="text-err text-xs font-mono bg-err/10 border border-err/20 p-3 rounded-lg">
                ACCESS DENIED: {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full bg-gradient-to-r from-accent to-accent-2 text-white disabled:from-panel-2 disabled:to-panel-2 disabled:text-muted/50 py-3.5 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,42,95,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:shadow-none disabled:hover:scale-100 group"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  INITIALIZE LINK
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>

          {hasGoogleClientId() && (
            <>
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border/30" />
                </div>
                <div className="relative flex justify-center text-[10px] font-mono">
                  <span className="bg-panel px-3 text-muted/60 uppercase tracking-widest">or bypass via</span>
                </div>
              </div>
              <div ref={gbtn} className="flex justify-center" />
            </>
          )}
        </div>

        <p className="text-center text-sm text-muted mt-8 font-medium">
          New operative?{" "}
          <Link to="/signup" className="text-accent font-bold hover:text-glow hover:underline underline-offset-4 decoration-accent/50 transition-all">
            Request access
          </Link>
        </p>
      </div>
    </div>
  );
}
