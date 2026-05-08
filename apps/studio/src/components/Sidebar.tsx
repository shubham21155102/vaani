import { NavLink } from "react-router-dom";
import {
  Home,
  Mic2,
  AudioLines,
  Users,
  KeyRound,
  CreditCard,
  BookOpen,
} from "lucide-react";

const NAV = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/tts", icon: Mic2, label: "Text to Speech" },
  { to: "/stt", icon: AudioLines, label: "Speech to Text" },
  { to: "/voices", icon: Users, label: "Voices" },
  { to: "/keys", icon: KeyRound, label: "API Keys" },
  { to: "/usage", icon: CreditCard, label: "Usage & Credits" },
  { to: "/docs", icon: BookOpen, label: "API Reference" },
];

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-panel h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 flex items-center gap-2 border-b border-border">
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="font-semibold tracking-tight">Vaani</span>
        <span className="ml-auto text-[10px] text-muted uppercase">Studio</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                isActive
                  ? "bg-panel-2 text-text"
                  : "text-muted hover:text-text hover:bg-panel-2",
              ].join(" ")
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 text-[11px] text-muted border-t border-border">
        v0.1.0 · open-stack voice AI
      </div>
    </aside>
  );
}
