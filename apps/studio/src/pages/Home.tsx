import { Link } from "react-router-dom";
import { Mic2, AudioLines, Users, BookOpen, ArrowRight, Zap } from "lucide-react";

const cards = [
  {
    to: "/tts",
    icon: Mic2,
    title: "TEXT TO SPEECH",
    body: "Generate expressive audio with 25 voices across 10 languages. Powered by next-gen AI.",
    gradient: "from-[#ff2a5f] to-[#ff7e27]",
  },
  {
    to: "/stt",
    icon: AudioLines,
    title: "SPEECH TO TEXT",
    body: "Lightning-fast transcription with diarization, timestamps, and 50+ language support.",
    gradient: "from-[#00e676] to-[#00b0ff]",
  },
  {
    to: "/voices",
    icon: Users,
    title: "VOICE CATALOG",
    body: "Browse all available speakers and preview them before committing to a voice.",
    gradient: "from-[#8b5cf6] to-[#d946ef]",
  },
  {
    to: "/docs",
    icon: BookOpen,
    title: "API REFERENCE",
    body: "Drop us in as an OpenAI-style endpoint. Curl-able from any language.",
    gradient: "from-[#ff1744] to-[#f50057]",
  },
];

export function Home() {
  return (
    <div className="animate-slide-up relative">
      {/* Background decorations */}
      <div className="absolute -top-20 -left-20 w-64 h-64 bg-accent/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute top-40 right-10 w-72 h-72 bg-accent-2/20 rounded-full blur-[120px] pointer-events-none" />

      <div className="relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel text-xs font-bold text-accent mb-6 animate-pulse-glow">
          <Zap size={14} className="text-accent-2" />
          <span>V0.1.0 ONLINE</span>
        </div>
        
        <h1 className="text-5xl sm:text-7xl font-display font-black tracking-tighter leading-tight mb-4">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">VOICES THAT </span>
          <br className="hidden sm:block" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent to-accent-2 animate-gradient-x">FEEL ALIVE.</span>
        </h1>
        
        <p className="text-muted/90 mt-6 max-w-2xl text-lg sm:text-xl font-light leading-relaxed">
          Vaani is an open-stack voice AI platform — TTS, STT, and conversational primitives
          you can run from your own infrastructure or call through one blazing-fast HTTPS endpoint.
        </p>

        <div className="grid gap-6 mt-12 sm:grid-cols-2">
          {cards.map(({ to, icon: Icon, title, body, gradient }) => (
            <Link
              key={to}
              to={to}
              className="group relative p-6 glass-panel rounded-2xl border border-border/50 hover:border-transparent transition-all duration-500 overflow-hidden"
            >
              <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 bg-gradient-to-br ${gradient} transition-opacity duration-500`} />
              
              <div className="relative z-10 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${gradient} shadow-lg shadow-black/50 group-hover:scale-110 transition-transform duration-500`}>
                  <Icon size={24} className="text-white" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-display font-bold tracking-wide text-sm">{title}</h3>
                    <ArrowRight
                      size={18}
                      className="text-muted group-hover:text-white transform group-hover:translate-x-1 transition-all duration-300"
                    />
                  </div>
                  <p className="text-sm text-muted/80 leading-relaxed font-medium group-hover:text-text/90 transition-colors duration-300">
                    {body}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
