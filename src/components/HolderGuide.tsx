"use client";
// 이미 샀다면: 산 가격을 넣으면 지금 할 일을 한 줄로
import Link from "next/link";
import { useState } from "react";
import { TONE_CLASS } from "@/components/ui";
import { money, pct, toneOf } from "@/lib/format";
import { holderAdvice } from "@/lib/simple";
import { earningsDaysLeft, type TradePlan } from "@/lib/tradePlan";
import type { Position } from "@/lib/types";

export default function HolderGuide({
  symbol,
  price,
  plan,
  blocked,
  earningsAt,
  position,
}: {
  symbol: string;
  price: number;
  plan: TradePlan | null;
  blocked: string | null;
  earningsAt: number | null;
  position?: Position;
}) {
  const [input, setInput] = useState("");
  const buy = position?.avgCost ?? (Number(input) > 0 ? Number(input) : null);
  const stop = position?.stop ?? plan?.stop?.price ?? null;
  const t1 = position?.target ?? plan?.t1?.price ?? null;
  const t2 = plan?.t2?.price ?? null;
  const a = buy != null ? holderAdvice({ buy, price, stop, t1, t2, blocked, earningsDays: earningsDaysLeft(earningsAt) }) : null;
  const gain = buy != null ? ((price - buy) / buy) * 100 : null;
  const saveHref = buy != null ? `/positions?add=${symbol}&price=${buy.toFixed(2)}${stop != null ? `&stop=${stop.toFixed(2)}` : ""}${t1 != null ? `&target=${t1.toFixed(2)}` : ""}` : "";

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold text-[15px]">이미 샀다면?</h2>
        <span className="text-xs text-muted">산 가격을 넣으면 지금 할 일을 알려 드립니다</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
        {position ? (
          <span className="text-muted">
            보유 종목에 적어 둔 평단 <b className="text-text num">{money(position.avgCost)}</b> 기준
          </span>
        ) : (
          <>
            <span className="text-muted">내가 산 가격 $</span>
            <input type="number" min={0} step={0.01} inputMode="decimal" className="w-28" placeholder={price.toFixed(2)} value={input} onChange={(e) => setInput(e.target.value)} />
          </>
        )}
        {gain != null && (
          <span className={`num ${toneOf(gain)}`}>
            지금 {money(price)} · {pct(gain, 1)}
          </span>
        )}
      </div>
      {a && (
        <div className={`rounded-xl border p-4 mt-3 ${TONE_CLASS[a.tone]}`}>
          <div className="text-xl font-bold text-text">
            {a.dot} {a.title}
          </div>
          <p className="text-sm text-text/90 mt-1 leading-relaxed">{a.text}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted mt-2 num">
            {stop != null && <span>손절가 {money(stop)} ({pct(((stop - price) / price) * 100, 1)})</span>}
            {t1 != null && <span>1차 목표 {money(t1)} ({pct(((t1 - price) / price) * 100, 1)})</span>}
            {t2 != null && <span>2차 목표 {money(t2)}</span>}
          </div>
        </div>
      )}
      {!position && buy != null && (
        <p className="text-xs text-muted mt-2">
          <Link className="text-accent" href={saveHref}>
            보유 종목에 저장
          </Link>
          하면 손절가·목표가에 닿을 때 홈 &lsquo;오늘 할 일&rsquo;에 표시됩니다.
        </p>
      )}
    </div>
  );
}
