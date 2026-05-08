import { KeyRound, Lock } from "lucide-react";

export function Keys() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
      <p className="text-muted mt-1">
        Generate and revoke keys for programmatic access.
      </p>

      <div className="mt-6 p-8 bg-panel border border-border rounded-xl flex flex-col items-center text-center">
        <div className="w-12 h-12 rounded-full bg-panel-2 flex items-center justify-center">
          <Lock size={20} className="text-muted" />
        </div>
        <h2 className="mt-4 font-semibold">Key management is in development</h2>
        <p className="text-sm text-muted mt-2 max-w-md">
          Authenticated <code>sk_live_*</code> keys, per-key rate limits, and a
          one-time-reveal flow are part of the Week 2 backend sprint. Currently
          the API is open to any caller; do not share the URL widely yet.
        </p>
        <a
          href="https://vaani-api.shubhamiitbhu.in"
          className="mt-6 inline-flex items-center gap-2 text-accent hover:underline text-sm"
        >
          <KeyRound size={14} /> Use the open endpoint while we build this
        </a>
      </div>
    </div>
  );
}
