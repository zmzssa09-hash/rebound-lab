"use client";
import { Chip, Section, TONE_CLASS } from "@/components/ui";
import { money, pct } from "@/lib/format";
import { actionOf, ZONE_INFO, zoneOf, type BuyZones, type TradePlan, type ZoneKey } from "@/lib/tradePlan";
import type { PickPlan } from "@/lib/types";

const pr = (v: number | null) => (v == null ? "–" : `${(v * 100).toFixed(0)}%`);

/** 지금 해야 할 일 + 매수 구간 + 단기 목표가·손절 */
export function TradePlanPanel({ plan, price, blocked, loading, shortScore = null }: { plan: TradePlan | null; price: number; blocked: string | null; loading: boolean; shortScore?: number | null }) {
  if (loading || !plan) return <div className="card h-48 animate-pulse" />;
  const zone = zoneOf(plan.zones, price);
  const act = actionOf({ blocked, zone, price, stop: plan.stop?.price ?? null, rr: plan.rr, shortScore });

  return (
    <Section title="매매 계획 — 지금 사도 될까?" right={<span className="text-xs text-muted">실시간 가격 기준</span>}>
      <div className={`rounded-xl border p-4 ${TONE_CLASS[act.tone]}`}>
        <div className="text-xs opacity-80">지금 해야 할 일</div>
        <div className="text-2xl font-bold text-text mt-0.5">{act.title}</div>
        <p className="text-sm text-text/90 mt-1 leading-relaxed">{act.text}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mt-4">
        {/* 장기: 매수 구간 */}
        <div>
          <div className="text-sm font-semibold">매수 구간 <span className="text-xs text-muted font-normal">장기 3~12개월 · 적정가 기준</span></div>
          {plan.zones ? <ZoneLadder z={plan.zones} price={price} current={zone} stop={plan.stop?.price ?? null} /> : <p className="text-sm text-muted mt-2">적정가를 계산할 수 없어 매수 구간을 정하지 않았습니다.</p>}
        </div>

        {/* 단기: 목표가·손절 */}
        <div>
          <div className="text-sm font-semibold">단기 목표가와 손절선 <span className="text-xs text-muted font-normal">1~4주 · 지지·저항선 기준</span></div>
          <div className="mt-2 space-y-1.5 text-sm">
            {plan.t1 && <TargetRow name="1차 목표" t={plan.t1} price={price} />}
            {plan.t2 && <TargetRow name="2차 목표" t={plan.t2} price={price} />}
            {plan.stop && (
              <div className="rounded-lg border border-bad/40 bg-bad/5 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-bad w-16 shrink-0">손절</span>
                  <span className="num font-semibold">{money(plan.stop.price)}</span>
                  <span className="num text-xs text-bad">{pct(((plan.stop.price - price) / price) * 100, 1)}</span>
                </div>
                <div className="text-[11px] text-muted mt-0.5 pl-[4.5rem]">{plan.stop.basis} · 이 가격 아래로 마감하면 계획 철회</div>
              </div>
            )}
            {plan.rr != null && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-muted text-xs">손익비 (1차 목표 상승폭 ÷ 손절폭)</span>
                <Chip tone={plan.rr >= 2 ? "good" : plan.rr >= 1.5 ? "warn" : "bad"}>{plan.rr.toFixed(1)} : 1</Chip>
                <span className="text-[11px] text-muted">{plan.rr >= 2 ? "유리" : plan.rr >= 1.5 ? "보통" : "불리 — 1.5 이상일 때 매매"}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {plan.notes.length > 0 && (
        <ul className="mt-3 text-xs text-warn space-y-0.5">
          {plan.notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      )}

      <details className="mt-3">
        <summary className="text-xs text-accent cursor-pointer select-none">지지선·저항선·매물대 보기</summary>
        <div className="grid gap-3 sm:grid-cols-2 mt-2 text-xs">
          <LevelList title="위쪽 저항선" items={plan.resistances} price={price} />
          <LevelList title="아래쪽 지지선" items={plan.supports} price={price} />
        </div>
      </details>
      <p className="text-[11px] text-muted mt-3 leading-relaxed">
        목표가(단기에 팔 가격)와 매수 구간(장기 적정가 대비 살 가격)은 다른 개념입니다. 도달 확률은 이 종목의 과거 과매도 {plan.historyN}회에서 실제로 20거래일 안에 그 가격까지 오른 비율이며,
        미래를 보장하지 않습니다. 하락했다는 이유만으로 싸다고 판단하지 않습니다.
      </p>
    </Section>
  );
}

function TargetRow({ name, t, price }: { name: string; t: NonNullable<TradePlan["t1"]>; price: number }) {
  const p = ((t.price - price) / price) * 100;
  return (
    <div className="rounded-lg border border-good/30 bg-good/5 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-good w-16 shrink-0">{name}</span>
        <span className="num font-semibold">{money(t.price)}</span>
        <span className="num text-xs text-up">{pct(p, 1)}</span>
        {t.hitRate != null && (
          <span className="text-[11px] text-muted ml-auto">
            과거 도달 <span className="text-text num">{pr(t.hitRate)}</span>
            {t.medianDays != null && <> · 보통 {Math.round(t.medianDays)}거래일</>}
          </span>
        )}
      </div>
      <div className="text-[11px] text-muted mt-0.5 pl-[4.5rem]">{t.basis}</div>
    </div>
  );
}

function LevelList({ title, items, price }: { title: string; items: { price: number; label: string }[]; price: number }) {
  return (
    <div>
      <div className="font-medium mb-1">{title}</div>
      {items.length === 0 ? (
        <div className="text-muted">없음</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((l) => (
            <li key={l.label + l.price} className="flex gap-2">
              <span className="num w-16">{money(l.price)}</span>
              <span className="num text-muted w-14">{pct(((l.price - price) / price) * 100, 1)}</span>
              <span className="text-muted">{l.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 가격대별 매수 구간 사다리 (위가 비싼 가격) */
export function ZoneLadder({ z, price, current, stop, compact = false }: { z: BuyZones | NonNullable<PickPlan["zones"]>; price: number; current: ZoneKey | null; stop: number | null; compact?: boolean }) {
  const rows: { key: ZoneKey; range: string }[] = [
    { key: "over", range: `${money(z.watchMax)} 초과` },
    { key: "watch", range: `${money(z.splitMax)} ~ ${money(z.watchMax)}` },
    { key: "split", range: `${money(z.aggressiveMax)} ~ ${money(z.splitMax)}` },
    { key: "aggressive", range: `${money(z.aggressiveMax)} 이하` },
  ];
  return (
    <div className={compact ? "mt-1.5 space-y-1" : "mt-2 space-y-1.5"}>
      {rows.map((r) => {
        const on = r.key === current;
        const info = ZONE_INFO[r.key];
        return (
          <div
            key={r.key}
            className={`flex items-center gap-2 rounded-lg border px-3 ${compact ? "py-1 text-xs" : "py-1.5 text-sm"} ${on ? TONE_CLASS[info.tone] : "border-line text-muted"}`}
          >
            <span className={`${compact ? "w-24" : "w-28"} shrink-0 ${on ? "font-semibold text-text" : ""}`}>{info.label.replace(" 구간", "")}</span>
            <span className="num">{r.range}</span>
            {on && <span className="ml-auto text-[11px] font-medium text-text whitespace-nowrap">◀ 현재가 {money(price)}</span>}
          </div>
        );
      })}
      {stop != null && !compact && (
        <div className="text-[11px] text-muted px-1">손절 기준 {money(stop)} — 매수 구간과 상관없이 이 아래로 마감하면 정리</div>
      )}
      {!compact && "marginWhy" in z && (
        <div className="text-[11px] text-muted px-1">
          안전마진 {Math.round(z.margin * 100)}% ({z.marginWhy.join(" · ")}) → 매수가 = 기준 적정가 {money(z.fair)} × (1 − {Math.round(z.margin * 100)}%) = {money(z.buyPrice)}
          {z.bear != null && <> · 보수적 적정가 {money(z.bear)}</>}
        </div>
      )}
    </div>
  );
}
