import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { API_BASE } from "./api";

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  picture_url: string | null;
  credits: number;
  has_google: boolean;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
}

interface AuthCtx extends AuthState {
  loginEmail(email: string, password: string): Promise<void>;
  signupEmail(email: string, password: string, displayName?: string): Promise<void>;
  loginGoogle(credential: string): Promise<void>;
  logout(): void;
}

const TOKEN_KEY = "vaani.token";
const Ctx = createContext<AuthCtx | null>(null);

async function authPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({ detail: r.statusText }));
    throw new Error(err.detail || `HTTP ${r.status}`);
  }
  return r.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    loading: true,
  });

  // Bootstrap: if we have a stored token, fetch /me to validate + populate user.
  useEffect(() => {
    const tok = state.token;
    if (!tok) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/v1/auth/me`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        if (!r.ok) throw new Error("invalid session");
        const { user } = await r.json();
        setState({ user, token: tok, loading: false });
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        setState({ user: null, token: null, loading: false });
      }
    })();
    // intentionally only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = useCallback((token: string, user: User) => {
    localStorage.setItem(TOKEN_KEY, token);
    setState({ user, token, loading: false });
  }, []);

  const loginEmail = useCallback(
    async (email: string, password: string) => {
      const { token, user } = await authPost<{ token: string; user: User }>(
        "/v1/auth/login",
        { email, password }
      );
      finish(token, user);
    },
    [finish]
  );

  const signupEmail = useCallback(
    async (email: string, password: string, display_name?: string) => {
      const { token, user } = await authPost<{ token: string; user: User }>(
        "/v1/auth/signup",
        { email, password, display_name }
      );
      finish(token, user);
    },
    [finish]
  );

  const loginGoogle = useCallback(
    async (credential: string) => {
      const { token, user } = await authPost<{ token: string; user: User }>(
        "/v1/auth/google",
        { credential }
      );
      finish(token, user);
    },
    [finish]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setState({ user: null, token: null, loading: false });
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({ ...state, loginEmail, signupEmail, loginGoogle, logout }),
    [state, loginEmail, signupEmail, loginGoogle, logout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}

// Google Identity Services loader + button wiring -----------------------------

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(config: {
            client_id: string;
            callback: (resp: { credential: string }) => void;
            ux_mode?: "popup" | "redirect";
            auto_select?: boolean;
          }): void;
          renderButton(
            el: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "small" | "medium" | "large";
              width?: number;
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
            }
          ): void;
          prompt(): void;
          cancel(): void;
        };
      };
    };
  }
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as
  | string
  | undefined;

export function hasGoogleClientId(): boolean {
  return Boolean(GOOGLE_CLIENT_ID);
}

let gisReadyPromise: Promise<void> | null = null;

function waitForGis(): Promise<void> {
  if (gisReadyPromise) return gisReadyPromise;
  gisReadyPromise = new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.google?.accounts?.id) return resolve();
      if (Date.now() - start > 5000) {
        return reject(new Error("Google Identity Services failed to load"));
      }
      setTimeout(tick, 50);
    };
    tick();
  });
  return gisReadyPromise;
}

export async function mountGoogleButton(
  el: HTMLElement,
  onCredential: (credential: string) => void,
  text: "signin_with" | "signup_with" | "continue_with" = "continue_with"
): Promise<void> {
  if (!GOOGLE_CLIENT_ID) {
    el.textContent = "Google Sign-in not configured";
    el.classList.add("text-muted", "text-sm");
    return;
  }
  await waitForGis();
  window.google!.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (resp) => onCredential(resp.credential),
    ux_mode: "popup",
  });
  el.innerHTML = "";
  window.google!.accounts.id.renderButton(el, {
    type: "standard",
    theme: "filled_black",
    size: "large",
    text,
    shape: "rectangular",
    width: 320,
  });
}
