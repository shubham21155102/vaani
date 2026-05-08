import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LogOut, UserRound } from "lucide-react";
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
        className="text-sm px-3 py-1.5 rounded-md border border-border hover:border-accent hover:text-accent transition-colors"
      >
        Sign in
      </Link>
    );
  }

  const display = user.display_name || user.email;
  const initial = (user.display_name || user.email)[0].toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-panel-2 transition-colors"
      >
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt=""
            className="w-7 h-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="w-7 h-7 rounded-full bg-panel-2 border border-border flex items-center justify-center text-xs font-medium">
            {initial}
          </span>
        )}
        <span className="hidden sm:inline text-sm">{display}</span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-panel border border-border rounded-lg shadow-lg z-20 py-1">
          <div className="px-3 py-2 border-b border-border">
            <div className="text-sm font-medium truncate">{display}</div>
            <div className="text-xs text-muted truncate">{user.email}</div>
          </div>
          <div className="px-3 py-2 text-xs text-muted">
            <span className="font-mono">{user.credits}</span> credits
          </div>
          <Link
            to="/keys"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-panel-2"
          >
            <UserRound size={14} /> Account & keys
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-panel-2 text-left"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
