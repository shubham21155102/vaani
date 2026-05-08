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

  let label = "checking…";
  let color = "text-muted";
  if (error) {
    label = "offline";
    color = "text-err";
  } else if (info) {
    label = info.ready ? `ready · ${info.tts_model.split("/").pop()}` : "loading…";
    color = info.ready ? "text-ok" : "text-muted";
  }
  return (
    <span className={`text-xs px-3 py-1 border border-border rounded-full ${color}`}>
      {label}
    </span>
  );
}
