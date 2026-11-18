"use client";
import Link from "next/link";
import Krw from "@/components/Krw";
import Term from "@/components/Term";
import { krw, money } from "@/lib/format";
import { sizePosition } from "@/lib/sizing";
import { setData, useAppData, useHydrated } from "@/lib/store";
import { afterTax, FEE_RATE, TAX_FREE_KRW } from "@/lib/tax";
import { useBearMarket, useUsdKrw } from "@/lib/useSession";

type Sizing = { account: number; riskPct: number; maxWeight: number; unit: "USD" | "KRW"; gainsKrw: number };
const DEFAULT: Sizing = { account: 0, riskPct: 1, maxWeight: 20, unit: "USD", gainsKrw: 0 };

export function useSizing() {
  const app = useAppData();
  const rate = useUsdKrw();
  const s: Sizing = { ...DEFAULT, ...(app.sizing ?? {}) } as Sizing;
  const set = (patch: Partial<Sizing>) => setData((d) => ({ ...d, sizing: { ...DEFAULT, ...(d.sizing ?? {}), ...patch } }));
  // 계산은 항상 달러로
  const accountUsd = s.unit === "KRW" ? (rate ? s.account / rate : 0) : s.account;
  return { s, set, accountUsd, rate };
}

/** 투자금 설정 입력 (계산기·추천 화면 공용) */
export function SizingSettings({ compact = false }: { compact?: boolean }) {
  const hydrated = useHydrated();
  const { s, set, accountUsd, rate } = useSizing();
  const btn = (on: boolean) => `rounded-md border px-2 py-0.5 ${on ? "border-accent text-accent" : "border-line text-muted"}`;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? "text-xs" : "text-sm"}`}>
      <span className="flex items-center gap-1.5">
        <span className="text-muted">내 투자금</span>
        <span className="flex">
          <button className={`${btn(s.unit === "KRW")} rounded-r-none`} onClick={() => set({ unit: "KRW", account: s.unit === "USD" && rate ? Math.round((s.account * rate) / 10000) * 10000 : s.account })}>
            원
          </button>
          <button className={`${btn(s.unit === "USD")} rounded-l-none -ml-px`} onClick={() => set({ unit: "USD", account: s.unit === "KRW" && rate ? Math.round(s.account / rate) : s.account })}>
            $
          </button>
        </span>
        <input
          type="number"
          min={0}
          step={s.unit === "KRW" ? 100000 : 100}
          className={compact ? "w-28 py-0.5" : "w-32"}
          placeholder={s.unit === "KRW" ? "예: 10000000" : "예: 10000"}
          value={hydrated && s.account ? s.account : ""}
          onChange={(e) => set({ account: Math.max(0, Number(e.target.value) || 0) })}
        />
        {hydrated && s.account > 0 && (
          <span className="text-muted num">{s.unit === "KRW" ? (rate ? `= ${money(accountUsd)}` : "") : <Krw usd={s.account} paren={false} />}</span>
        )}
      </span>
      <span className="flex items-center gap-1">
        <span className="text-muted">한 번에 감수할 손실</span>
        {[1, 2].map((r) => (
          <button key={r} className={btn(s.riskPct === r)} onClick={() => set({ riskPct: r })}>
            {r}%
          </button>
        ))}
      </span>
      <span className="flex items-center gap-1">
        <span className="text-muted">한 종목 최대</span>
        {[10, 20].map((w) => (
          <button key={w} className={btn(s.maxWeight === w)} onClick={() => set({ maxWeight: w })}>
            {w}%
          </button>
        ))}
      </span>
    </div>
  );
}

/** 몇 주 살지 계산 결과 (+ 1차 목표에서 팔았을 때 세후 수익) */
export default function PositionSizer({ price, stop, target = null, compact = false }: { price: number; stop: number | null; target?: number | null; compact?: boolean }) {
  const hydrated = useHydrated();
  const bear = useBearMarket();
  const { s, set, accountUsd, rate } = useSizing();
  if (!hydrated) return null;
  const r = sizePosition({ account: accountUsd, riskPct: s.riskPct, maxWeight: s.maxWeight, price, stop, bear });

  if (compact) {
    if (!r) return <Link href="/guide#sizing" className="text-[11px] text-accent">내 투자금을 입력하면 몇 주 살지 계산해 드립니다 →</Link>;
    return (
      <div className="text-[11px] text-text/85">
        내 투자금 기준 <b className="num text-text">{r.shares}주</b> ({money(r.cost)}
        <Krw usd={r.cost} paren={false} className="text-muted ml-1" />, 비중 {r.weight.toFixed(0)}%) · 1차 <b className="num">{r.firstBuy}주</b>
        {bear && <span className="text-bad"> · 약세장 절반</span>}
      </div>
    );
  }

  const at = r && target && r.shares > 0 ? afterTax({ buy: price, sell: target, shares: r.shares, rate, otherGainsKrw: s.gainsKrw }) : null;
  const loss = r && stop && r.shares > 0 ? afterTax({ buy: price, sell: stop, shares: r.shares, rate }) : null;

  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-sm font-semibold">
        몇 주 살까? <span className="text-xs text-muted font-normal">손절에 걸려도 투자금의 {s.riskPct}%만 잃도록</span>
      </div>
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
              <div className="num font-medium">
                {money(r.cost)} · {r.weight.toFixed(1)}%
              </div>
              <Krw usd={r.cost} paren={false} className="text-muted num" />
            </div>
            <div>
              <div className="text-muted">
                <Term k="손절" /> 시 손실
              </div>
              <div className="num font-medium text-bad">
                −{money(r.lossAtStop)} ({r.lossPct.toFixed(1)}%)
              </div>
              {loss?.netKrw != null && <div className="text-muted num">수수료 포함 ≈ {krw(loss.netKrw)}</div>}
            </div>
            <div>
              <div className="text-muted">
                <Term k="분할 매수" />
              </div>
              <div className="num font-medium">
                1차 {r.firstBuy}주 → 나머지 {r.shares - r.firstBuy}주
              </div>
            </div>
          </div>

          {at && (
            <div className="mt-3 rounded-md bg-panel-2 px-3 py-2 text-xs">
              <div className="font-medium">1차 목표({money(target)})에서 모두 팔면 — 손에 쥐는 돈</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1.5 num">
                <div>
                  <div className="text-muted">매매 차익</div>
                  <div className="text-up">+{money(at.grossUsd)}</div>
                </div>
                <div>
                  <div className="text-muted">수수료 (사고팔 때 {(FEE_RATE * 100).toFixed(2)}%씩)</div>
                  <div>−{money(at.feesUsd)}</div>
                </div>
                <div>
                  <div className="text-muted">양도소득세</div>
                  <div>{at.taxKrw == null ? "–" : at.taxKrw > 0 ? `−${krw(at.taxKrw)}` : "0원 (공제 안)"}</div>
                </div>
                <div>
                  <div className="text-muted">세후 수익</div>
                  <div className="font-semibold text-up">{at.afterTaxKrw != null ? krw(at.afterTaxKrw) : money(at.netUsd)}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-2 text-muted">
                <span>올해 이미 낸 해외주식 순이익</span>
                <input
                  type="number"
                  min={0}
                  step={100000}
                  className="w-28 py-0.5"
                  placeholder="0"
                  value={s.gainsKrw || ""}
                  onChange={(e) => set({ gainsKrw: Math.max(0, Number(e.target.value) || 0) })}
                />
                <span>원</span>
              </div>
              <p className="text-[11px] text-muted mt-1">
                해외주식 양도소득세: 1년 동안 번 순이익 중 {krw(TAX_FREE_KRW)}을 넘는 부분의 22%(지방세 포함), 다음 해 5월에 신고. 손실 난 거래와 상계됩니다. 환전 수수료는 빠져 있습니다.
              </p>
            </div>
          )}

          <ul className="text-[11px] text-muted mt-2 space-y-0.5">
            <li>
              • {r.limitedBy === "risk" ? `손절 시 손실 한도(투자금의 ${s.riskPct}%)` : `한 종목 비중 한도(${s.maxWeight}%)`}에 맞춰 계산했습니다. 동시에 보유하는 종목은 최대 {r.maxStocks}개, 같은
              업종은 2개까지 권장합니다.
            </li>
            <li>• 1차로 절반을 사고, 주가가 지지선을 지키거나 반등이 확인되면 나머지를 삽니다.</li>
            {r.notes.map((n) => (
              <li key={n} className={n.includes("약세장") ? "text-bad" : ""}>
                • {n}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
