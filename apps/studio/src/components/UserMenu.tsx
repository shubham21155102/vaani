import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, UserRound, Zap } from "lucide-react";
import { useAuth } from "../lib/auth";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (!user) {
    return (
      <Link
        to="/login"
        className="text-sm font-semibold tracking-wide px-5 py-2 rounded-lg bg-accent text-white hover:bg-accent-hover hover:scale-105 shadow-[0_0_15px_rgba(255,42,95,0.4)] transition-all duration-300"
      >
        SIGN IN
      </Link>
    );
  }

  const display = user.display_name || user.email;
  const initial = (user.display_name || user.email)[0].toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-full bg-panel/50 border border-border/50 hover:bg-panel hover:border-accent/50 hover:shadow-[0_0_10px_rgba(255,42,95,0.2)] transition-all duration-300 group"
      >
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt=""
            className="w-8 h-8 rounded-full ring-2 ring-transparent group-hover:ring-accent/50 transition-all"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="w-8 h-8 rounded-full bg-panel-2 border border-border flex items-center justify-center text-xs font-bold text-accent group-hover:bg-accent/10 transition-colors">
            {initial}
          </span>
        )}
        <span className="hidden sm:inline text-sm font-medium pr-1">{display}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-64 glass-panel rounded-xl shadow-2xl z-50 py-2 border border-border/50 animate-fade-in origin-top-right overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-panel-2/30">
            <div className="text-sm font-bold truncate">{display}</div>
            <div className="text-xs text-muted truncate mt-0.5">{user.email}</div>
          </div>
          <div className="px-4 py-3 text-xs flex items-center justify-between border-b border-border/50 bg-panel/30">
            <span className="text-muted font-medium">BALANCE</span>
            <div className="flex items-center gap-1 text-accent-2 font-mono font-bold bg-accent-2/10 px-2 py-1 rounded">
              <Zap size={12} className="text-accent-2" />
              {user.credits}
            </div>
          </div>
          <div className="p-2 space-y-1">
            <Link
              to="/keys"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg hover:bg-accent/10 hover:text-accent transition-colors"
            >
              <UserRound size={16} /> Account & Keys
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                logout();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg hover:bg-err/10 hover:text-err text-left transition-colors"
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
