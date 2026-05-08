import { NavLink } from "react-router-dom";
import {
  Home,
  Mic2,
  AudioLines,
  Users,
  KeyRound,
  CreditCard,
  BookOpen,
  MessageSquare,
  X,
} from "lucide-react";

const NAV = [
  { to: "/", icon: Home, label: "Home", end: true },
  { to: "/tts", icon: Mic2, label: "Text to Speech" },
  { to: "/stt", icon: AudioLines, label: "Speech to Text" },
  { to: "/agent", icon: MessageSquare, label: "Voice Agent" },
  { to: "/voices", icon: Users, label: "Voices" },
  { to: "/keys", icon: KeyRound, label: "API Keys" },
  { to: "/usage", icon: CreditCard, label: "Usage & Credits" },
  { to: "/docs", icon: BookOpen, label: "API Reference" },
];

export function Sidebar({ isOpen, close }: { isOpen?: boolean; close?: () => void }) {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden animate-fade-in"
          onClick={close}
        />
      )}
      
      <aside 
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-64 shrink-0 border-r border-border/50 bg-panel/95 backdrop-blur-md h-screen flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="px-6 py-5 flex items-center justify-between border-b border-border/50">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-accent shadow-[0_0_8px_#ff2a5f]"></span>
            </span>
            <span className="font-display font-bold tracking-widest text-lg text-glow">VAANI</span>
          </div>
          {close && (
            <button onClick={close} className="md:hidden text-muted hover:text-accent transition-colors">
              <X size={20} />
            </button>
          )}
        </div>
        
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={close}
              className={({ isActive }) =>
                [
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group relative overflow-hidden",
                  isActive
                    ? "bg-accent/10 text-accent border border-accent/20 shadow-[inset_0_0_12px_rgba(255,42,95,0.1)]"
                    : "text-muted hover:text-text hover:bg-panel-2 hover:border-transparent border border-transparent",
                ].join(" ")
              }
            >
              <Icon size={18} className="group-hover:scale-110 transition-transform duration-300" />
              <span className="relative z-10">{label}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="p-5 text-[11px] font-mono text-muted/70 border-t border-border/50 flex justify-between items-center bg-bg/50">
          <span>v0.1.0</span>
          <span className="uppercase tracking-wider">open-stack</span>
        </div>
      </aside>
    </>
  );
}
