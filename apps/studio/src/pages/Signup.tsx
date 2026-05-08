import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Zap } from "lucide-react";
import { hasGoogleClientId, mountGoogleButton, useAuth } from "../lib/auth";

export function Signup() {
  const { user, signupEmail, loginGoogle } = useAuth();
  const navigate = useNavigate();
  const gbtn = useRef<HTMLDivElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (!gbtn.current) return;
    mountGoogleButton(gbtn.current, async (credential) => {
      setError(null);
      try {
        await loginGoogle(credential);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }, "signup_with").catch((e) => setError(e.message));
  }, [loginGoogle]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signupEmail(email, password, name || undefined);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg relative overflow-hidden">
      {/* Ambient background glows */}
      <div className="absolute -top-1/4 -right-1/4 w-96 h-96 bg-accent-2/20 rounded-full blur-[120px] pointer-events-none animate-pulse-glow" />
      <div className="absolute bottom-0 left-0 w-80 h-80 bg-accent/10 rounded-full blur-[100px] pointer-events-none" />

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
            INITIALIZE UPLINK
          </h1>
          <p className="text-muted/80 text-center mb-8 font-medium">
            Get <strong className="text-accent-2 font-mono px-1">999</strong> free credits to start synthesizing
          </p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-2 ml-1">
                Operative Name
              </label>
              <input
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-panel-2/50 border border-border/50 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-muted/30"
                placeholder="Ghost"
              />
            </div>
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
                placeholder="ghost@vaani.ai"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase tracking-widest text-muted mb-2 ml-1">
                Security Key
              </label>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-panel-2/50 border border-border/50 rounded-xl p-3.5 text-sm font-medium focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/50 transition-all placeholder:text-muted/30"
                placeholder="••••••••"
              />
              <p className="text-[10px] font-mono text-muted/60 mt-2 ml-1">Requires 8+ characters.</p>
            </div>
            
            {error && (
              <div className="text-err text-xs font-mono bg-err/10 border border-err/20 p-3 rounded-lg">
                ERROR: {error}
              </div>
            )}
            
            <button
              type="submit"
              disabled={loading || !email || password.length < 8}
              className="w-full bg-gradient-to-r from-accent to-accent-2 text-white disabled:from-panel-2 disabled:to-panel-2 disabled:text-muted/50 py-3.5 rounded-xl font-bold tracking-wide flex items-center justify-center gap-2 hover:shadow-[0_0_20px_rgba(255,42,95,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 disabled:shadow-none disabled:hover:scale-100 group"
            >
              {loading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Zap size={18} className="group-hover:scale-110 transition-transform" />
                  CREATE ACCOUNT
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
          Already verified?{" "}
          <Link to="/login" className="text-accent font-bold hover:text-glow hover:underline underline-offset-4 decoration-accent/50 transition-all">
            Access terminal
          </Link>
        </p>
      </div>
    </div>
  );
}
