import { CreditCard } from "lucide-react";

const stats = [
  { label: "Credits", value: "999", caption: "free-tier balance" },
  { label: "TTS calls", value: "—", caption: "this billing period" },
  { label: "STT seconds", value: "—", caption: "this billing period" },
];

export function Usage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Usage & Credits</h1>
      <p className="text-muted mt-1">Track your API consumption and remaining balance.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="p-5 bg-panel border border-border rounded-xl">
            <div className="text-xs uppercase tracking-wide text-muted">{s.label}</div>
            <div className="text-3xl font-semibold mt-2">{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.caption}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 bg-panel border border-border rounded-xl flex items-start gap-4">
        <CreditCard size={20} className="text-accent shrink-0 mt-1" />
        <div>
          <h2 className="font-semibold">Razorpay billing — coming Week 2</h2>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Pay-as-you-go pricing will land alongside the API-keys subsystem. Sarvam-class
            voices at roughly 30–50% of their published rates, with self-hosted licensing
            available for teams who want to run Vaani in their own VPC.
          </p>
        </div>
      </div>
    </div>
  );
}
