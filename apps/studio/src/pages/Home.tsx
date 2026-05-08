import { Link } from "react-router-dom";
import { Mic2, AudioLines, Users, BookOpen, ArrowRight } from "lucide-react";

const cards = [
  {
    to: "/tts",
    icon: Mic2,
    title: "Text to Speech",
    body: "Generate expressive audio with 25 voices across 10 languages. Powered by Microsoft VibeVoice.",
  },
  {
    to: "/stt",
    icon: AudioLines,
    title: "Speech to Text",
    body: "Long-form transcription with diarization, timestamps, and 50+ language support.",
  },
  {
    to: "/voices",
    icon: Users,
    title: "Voices catalog",
    body: "Browse all available speakers and preview them before committing to a voice.",
  },
  {
    to: "/docs",
    icon: BookOpen,
    title: "API Reference",
    body: "Drop us in as an OpenAI-style endpoint. Curl-able from any language.",
  },
];

export function Home() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Voices that feel real.</h1>
      <p className="text-muted mt-2 max-w-2xl">
        Vaani is an open-stack voice AI platform — TTS, STT, and conversational primitives
        you can run from your own infrastructure or call through one HTTPS endpoint.
      </p>
      <div className="grid gap-4 mt-8 sm:grid-cols-2">
        {cards.map(({ to, icon: Icon, title, body }) => (
          <Link
            key={to}
            to={to}
            className="group p-5 bg-panel border border-border rounded-xl hover:border-accent transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-md bg-panel-2 flex items-center justify-center">
                <Icon size={18} className="text-accent" />
              </div>
              <div className="font-medium">{title}</div>
              <ArrowRight
                size={16}
                className="ml-auto text-muted group-hover:text-text transition-colors"
              />
            </div>
            <p className="text-sm text-muted mt-3">{body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
