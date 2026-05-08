import { useEffect, useState } from "react";
import { api, type Info } from "../lib/api";

export function StatusPill() {
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      api
        .info()
        .then((i) => {
          if (alive) {
            setInfo(i);
            setError(false);
          }
        })
        .catch(() => alive && setError(true));
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  let label = "INITIALIZING SYSTEM...";
  let colorClass = "text-muted border-border/50 bg-panel/30";
  let dotClass = "bg-muted";

  if (error) {
    label = "SYSTEM OFFLINE";
    colorClass = "text-err border-err/30 bg-err/10 shadow-[0_0_10px_rgba(255,23,68,0.2)]";
    dotClass = "bg-err shadow-[0_0_5px_#ff1744] animate-pulse";
  } else if (info) {
    if (info.ready) {
      label = `READY · ${info.tts_model.split("/").pop()?.toUpperCase()}`;
      colorClass = "text-ok border-ok/30 bg-ok/10 shadow-[0_0_10px_rgba(0,230,118,0.15)]";
      dotClass = "bg-ok shadow-[0_0_5px_#00e676]";
    } else {
      label = "LOADING ENGINES...";
      colorClass = "text-accent border-accent/30 bg-accent/10";
      dotClass = "bg-accent shadow-[0_0_5px_#ff2a5f] animate-pulse";
    }
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border rounded-full text-[10px] font-mono font-bold tracking-wider transition-all duration-300 ${colorClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      <span className="hidden sm:inline-block">{label}</span>
      <span className="sm:hidden">{error ? 'OFFLINE' : (info?.ready ? 'READY' : 'INIT')}</span>
    </div>
  );
}
