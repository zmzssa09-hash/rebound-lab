"use client";
// 최근 실적 한 줄 요약 (1년 전 같은 분기와 비교)
import { Chip } from "@/components/ui";
import { summarizeEarnings } from "@/lib/earningsResult";
import type { Fundamentals } from "@/lib/types";

export default function EarningsResult({ f }: { f: Fundamentals | null }) {
  const s = summarizeEarnings(f?.lastQuarter, f?.financialCurrency ?? "USD");
  if (!s) return null;
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold text-[15px]">최근 실적</h2>
        <Chip tone={s.tone}>{s.label}</Chip>
        <span className="text-xs text-muted">{s.quarter} · 1년 전 같은 분기와 비교</span>
      </div>
      <p className="text-sm mt-2 font-medium">{s.headline}</p>
      <ul className="mt-1.5 text-sm text-muted space-y-0.5">
        {s.lines.map((l) => (
          <li key={l}>• {l}</li>
        ))}
      </ul>
      <p className="text-[11px] text-muted mt-2">전문가 예상치가 아니라 회사가 실제로 발표한 숫자끼리 비교합니다.</p>
    </div>
  );
}
