"use client";
import { money } from "@/lib/format";
import { useSectors } from "@/lib/useSectors";

/** 내 포지션 업종 구성 + 쏠림 경고 */
export default function SectorMix({ rows }: { rows: { symbol: string; value: number }[] }) {
  const sectors = useSectors(rows.map((r) => r.symbol));
  if (rows.length === 0) return null;
  const total = rows.reduce((a, r) => a + r.value, 0);
  const by = new Map<string, { value: number; syms: string[] }>();
  for (const r of rows) {
    const s = sectors[r.symbol] ?? "확인 중";
    const e = by.get(s) ?? { value: 0, syms: [] };
    e.value += r.value;
    e.syms.push(r.symbol);
    by.set(s, e);
  }
  const list = [...by.entries()].sort((a, b) => b[1].value - a[1].value);
  const warn = list.filter(([s, e]) => s !== "확인 중" && (e.syms.length >= 3 || (total > 0 && e.value / total >= 0.4)));
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-[15px]">업종 구성</h2>
        <span className="text-xs text-muted">같은 업종은 함께 오르고 함께 떨어집니다</span>
      </div>
      {warn.length > 0 && (
        <div className="mt-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-warn">
          {warn.map(([s, e]) => `${s} ${e.syms.length}종목(${Math.round((e.value / total) * 100)}%)`).join(", ")} — 한 업종에 몰려 있습니다. 같은 업종은 2종목, 투자금의 40% 이하로 줄이는 것을
          권합니다.
        </div>
      )}
      <div className="flex h-2.5 rounded overflow-hidden mt-3 bg-panel-2">
        {list.map(([s, e], i) => (
          <div key={s} title={`${s} ${Math.round((e.value / total) * 100)}%`} style={{ width: `${(e.value / total) * 100}%`, opacity: 1 - i * 0.12 }} className="bg-accent border-r border-bg" />
        ))}
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 text-sm">
        {list.map(([s, e]) => (
          <li key={s} className="flex justify-between gap-2">
            <span>
              {s} <span className="text-xs text-muted">{e.syms.join(", ")}</span>
            </span>
            <span className="num text-muted">
              {money(e.value)} · {total > 0 ? Math.round((e.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
