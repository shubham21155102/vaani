// Animated bar wave driven by an audio level (0..1).
// Used on /agent to show user + agent voice activity in real time.
import { useEffect, useRef, useState } from "react";

interface VoiceWaveProps {
  level: number; // 0..1, smoothed externally is fine
  active?: boolean; // speaking right now
  color?: "accent" | "ok" | "muted";
  bars?: number;
  className?: string;
}

const COLOR_MAP: Record<NonNullable<VoiceWaveProps["color"]>, string> = {
  accent: "bg-accent",
  ok: "bg-ok",
  muted: "bg-border",
};

export function VoiceWave({
  level,
  active = true,
  color = "accent",
  bars = 5,
  className = "",
}: VoiceWaveProps) {
  // Independent phase per bar so they shimmer instead of pulsing in lock-step.
  const phaseRef = useRef<number[]>(
    Array.from({ length: bars }, () => Math.random() * Math.PI * 2)
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let raf = 0;
    const animate = () => {
      setTick((t) => t + 1);
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Each bar's height: shaped by a sine wave + level.
  const now = tick;
  const amp = active ? Math.min(1, Math.max(0.05, level * 4)) : 0.05;

  return (
    <div className={`flex items-center gap-1 h-8 ${className}`}>
      {phaseRef.current.map((phase, i) => {
        const wave = (Math.sin(now * 0.18 + phase) + 1) / 2; // 0..1
        const h = 4 + wave * amp * 28; // 4..32 px
        return (
          <span
            key={i}
            className={`w-1 rounded-full transition-[height] duration-75 ${COLOR_MAP[color]}`}
            style={{
              height: `${h}px`,
              opacity: active ? 0.6 + amp * 0.4 : 0.4,
            }}
          />
        );
      })}
    </div>
  );
}
