import type { ReactNode } from "react";
import type { Tone } from "@/lib/types";

export const TONE_CLASS: Record<Tone, string> = {
  good: "text-good bg-good/10 border-good/30",
  warn: "text-warn bg-warn/10 border-warn/30",
  bad: "text-bad bg-bad/10 border-bad/30",
  neutral: "text-muted bg-panel-2 border-line",
};

export const TONE_DOT: Record<Tone, string> = {
  good: "bg-good",
  warn: "bg-warn",
  bad: "bg-bad",
  neutral: "bg-muted",
};

export function Chip({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}

export function RsiChip({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted">–</span>;
  const tone: Tone = value <= 30 ? "good" : value >= 70 ? "warn" : "neutral";
  const label = value <= 30 ? "과매도" : value < 40 ? "약세" : value >= 70 ? "과매수" : "";
  return (
    <Chip tone={tone}>
      <span className="num">{value.toFixed(1)}</span>
      {label && <span>{label}</span>}
    </Chip>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="text-sm text-muted mt-1 max-w-2xl leading-relaxed">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, right, children, className = "" }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-line">
        <h2 className="font-semibold text-[15px]">{title}</h2>
        {right}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, valueClass = "" }: { label: string; value: ReactNode; sub?: ReactNode; valueClass?: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={`text-xl font-semibold num mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 num">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted text-center py-10 px-4 leading-relaxed">{children}</div>;
}
