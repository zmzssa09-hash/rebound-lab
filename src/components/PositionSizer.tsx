"use client";
import Link from "next/link";
import Term from "@/components/Term";
import { money } from "@/lib/format";
import { sizePosition } from "@/lib/sizing";
import { setData, useAppData, useHydrated } from "@/lib/store";
import { useBearMarket } from "@/lib/useSession";

const DEFAULT = { account: 0, riskPct: 1, maxWeight: 20 };

export function useSizing() {
  const app = useAppData();
  const s = app.sizing ?? DEFAULT;
  const set = (patch: Partial<typeof DEFAULT>) => setData((d) => ({ ...d, sizing: { ...(d.sizing ?? DEFAULT), ...patch } }));
  return { s, set };
}

/** 투자금 설정 입력 (계산기·추천 화면 공용) */
export function SizingSettings({ compact = false }: { compact?: boolean }) {
  const hydrated = useHydrated();
  const { s, set } = useSizing();
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? "text-xs" : "text-sm"}`}>
      <label className="flex items-center gap-1.5">
        <span className="text-muted">내 투자금 $</span>
        <input
          type="number"
          min={0}
          step={100}
          className={compact ? "w-24 py-0.5" : "w-28"}
          placeholder="예: 10000"
          value={hydrated && s.account ? s.account : ""}
          onChange={(e) => set({ account: Math.max(0, Number(e.target.value) || 0) })}
        />
      </label>
      <span className="flex items-center gap-1">
        <span className="text-muted">한 번에 감수할 손실</span>
        {[1, 2].map((r) => (
          <button
            key={r}
            className={`rounded-md border px-2 py-0.5 ${s.riskPct === r ? "border-accent text-accent" : "border-line text-muted"}`}
            onClick={() => set({ riskPct: r })}
          >
            {r}%
          </button>
        ))}
      </span>
      <span className="flex items-center gap-1">
        <span className="text-muted">한 종목 최대</span>
        {[10, 20].map((w) => (
          <button
            key={w}
            className={`rounded-md border px-2 py-0.5 ${s.maxWeight === w ? "border-accent text-accent" : "border-line text-muted"}`}
            onClick={() => set({ maxWeight: w })}
          >
            {w}%
          </button>
        ))}
      </span>
    </div>
  );
}

/** 몇 주 살지 계산 결과 */
export default function PositionSizer({ price, stop, compact = false }: { price: number; stop: number | null; compact?: boolean }) {
  const hydrated = useHydrated();
  const bear = useBearMarket();
  const { s } = useSizing();
  if (!hydrated) return null;
  const r = sizePosition({ account: s.account, riskPct: s.riskPct, maxWeight: s.maxWeight, price, stop, bear });

  if (compact) {
    if (!r) return <Link href="/guide#sizing" className="text-[11px] text-accent">내 투자금을 입력하면 몇 주 살지 계산해 드립니다 →</Link>;
    return (
      <div className="text-[11px] text-text/85">
        내 투자금 기준 <b className="num text-text">{r.shares}주</b> ({money(r.cost)}, 비중 {r.weight.toFixed(0)}%) · 1차 <b className="num">{r.firstBuy}주</b>
        {bear && <span className="text-bad"> · 약세장 절반</span>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-sm font-semibold">몇 주 살까? <span className="text-xs text-muted font-normal">손절에 걸려도 투자금의 {s.riskPct}%만 잃도록</span></div>
      <div className="mt-2">
        <SizingSettings compact />
      </div>
      {!r ? (
        <p className="text-xs text-muted mt-2">투자금을 입력하면 살 수량이 나옵니다. 입력값은 이 브라우저에만 저장됩니다.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
            <div>
              <div className="text-muted">살 수량</div>
              <div className="text-xl font-semibold num">{r.shares}주</div>
            </div>
            <div>
              <div className="text-muted">필요 금액 · 비중</div>
              <div className="num font-medium">{money(r.cost)} · {r.weight.toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-muted"><Term k="손절" /> 시 손실</div>
              <div className="num font-medium text-bad">−{money(r.lossAtStop)} ({r.lossPct.toFixed(1)}%)</div>
            </div>
            <div>
              <div className="text-muted"><Term k="분할 매수" /></div>
              <div className="num font-medium">1차 {r.firstBuy}주 → 나머지 {r.shares - r.firstBuy}주</div>
            </div>
          </div>
          <ul className="text-[11px] text-muted mt-2 space-y-0.5">
            <li>
              • {r.limitedBy === "risk" ? `손절 시 손실 한도(투자금의 ${s.riskPct}%)` : `한 종목 비중 한도(${s.maxWeight}%)`}에 맞춰 계산했습니다. 동시에 보유하는 종목은 최대 {r.maxStocks}개까지 권장합니다.
            </li>
            <li>• 1차로 절반을 사고, 주가가 지지선을 지키거나 반등이 확인되면 나머지를 삽니다.</li>
            {r.notes.map((n) => <li key={n} className={n.includes("약세장") ? "text-bad" : ""}>• {n}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}
