import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
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
    <div className="min-h-screen flex items-center justify-center px-4 bg-bg">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 mb-8 justify-center">
          <span className="w-2 h-2 rounded-full bg-accent" />
          <span className="font-semibold text-lg">Vaani</span>
        </Link>

        <h1 className="text-2xl font-semibold tracking-tight text-center">
          Welcome back
        </h1>
        <p className="text-muted text-center mt-1 text-sm">
          Sign in to access your studio
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-2">
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-muted mb-2">
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-panel-2 border border-border rounded-lg p-2.5 focus:outline-none focus:border-accent"
            />
          </div>
          {error && <div className="text-err text-sm">{error}</div>}
          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-accent text-[#1a1300] disabled:bg-[#444] disabled:text-[#999] py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-accent-2 transition-colors"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            Sign in
          </button>
        </form>

        {hasGoogleClientId() && (
          <>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-bg px-2 text-muted">or</span>
              </div>
            </div>
            <div ref={gbtn} className="flex justify-center" />
          </>
        )}

        <p className="text-center text-sm text-muted mt-6">
          New here?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
