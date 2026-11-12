"use client";
import { useEffect, useState } from "react";
import { Section } from "@/components/ui";
import { money, signedMoney, toneOf } from "@/lib/format";
import type { Position } from "@/lib/types";
import { isQuote, type QuoteMap } from "@/lib/useQuotes";

/** A를 매도해 B로 갈아타는 경우의 단순 계산 (예: SVIX $26 매도 → VCYT $23 매수) */
export default function SwitchCalculator({ positions, quotes, cash }: { positions: Position[]; quotes: QuoteMap; cash: number }) {
  const [fromId, setFromId] = useState(positions[0]?.id ?? "");
  const from = positions.find((p) => p.id === fromId) ?? positions[0];
  const [sellShares, setSellShares] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [toSym, setToSym] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [useCash, setUseCash] = useState(false);
  const [feePct, setFeePct] = useState("0.25");

  // 매도 종목이 바뀌면 기본값: 전량, 목표가(없으면 현재가)
  useEffect(() => {
    if (!from) return;
    const q = quotes[from.symbol];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSellShares(String(from.shares));
    setSellPrice(String(from.target ?? (isQuote(q) ? q.price.toFixed(2) : from.avgCost)));
  }, [from?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (positions.length === 0) return null;

  const n = Number(sellShares) || 0;
  const sp = Number(sellPrice) || 0;
  const bp = Number(buyPrice) || 0;
  const fee = Math.max(0, Number(feePct) || 0) / 100;

  const gross = n * sp;
  const sellFee = gross * fee;
  const proceeds = gross - sellFee;
  const realized = from ? (sp - from.avgCost) * n - sellFee : 0;
  const budget = proceeds + (useCash ? cash : 0);
  const buyShares = bp > 0 ? Math.floor(budget / (bp * (1 + fee))) : 0;
  const buyCost = buyShares * bp * (1 + fee);
  const left = budget - buyCost;
  const toQuote = toSym ? quotes[toSym.toUpperCase()] : undefined;

  return (
    <Section title="갈아타기 계산기">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div className="text-sm font-medium">① 매도</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              종목
              <select value={from?.id} onChange={(e) => setFromId(e.target.value)} className="text-sm text-text">
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>{p.symbol}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              수량
              <input type="number" min={0} step="any" value={sellShares} onChange={(e) => setSellShares(e.target.value)} className="text-sm text-text" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              매도가
              <input type="number" min={0} step="0.01" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="text-sm text-text" />
            </label>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm num">
            <dt className="text-muted">매도 대금</dt>
            <dd className="text-right">{money(gross)}</dd>
            <dt className="text-muted">실현 손익 (수수료 반영)</dt>
            <dd className={`text-right ${toneOf(realized)}`}>{signedMoney(realized)}</dd>
          </dl>
        </div>
        <div className="space-y-3">
          <div className="text-sm font-medium">② 매수</div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              종목
              <input value={toSym} onChange={(e) => setToSym(e.target.value.toUpperCase())} placeholder="VCYT" className="text-sm text-text uppercase" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              매수가
              <input type="number" min={0} step="0.01" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} placeholder={isQuote(toQuote) ? toQuote.price.toFixed(2) : "23.00"} className="text-sm text-text" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              수수료 %
              <input type="number" min={0} step="0.01" value={feePct} onChange={(e) => setFeePct(e.target.value)} className="text-sm text-text" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={useCash} onChange={(e) => setUseCash(e.target.checked)} />
            보유 현금 {money(cash)}도 사용
          </label>
          <dl className="grid grid-cols-2 gap-y-1 text-sm num">
            <dt className="text-muted">매수 가능 수량</dt>
            <dd className="text-right font-semibold">{bp > 0 ? `${buyShares}주` : "–"}</dd>
            <dt className="text-muted">매수 비용</dt>
            <dd className="text-right">{bp > 0 ? money(buyCost) : "–"}</dd>
            <dt className="text-muted">남는 현금</dt>
            <dd className="text-right">{bp > 0 ? money(left) : "–"}</dd>
          </dl>
        </div>
      </div>
      <p className="text-xs text-muted mt-4 leading-relaxed">
        목표 가격 기준의 단순 계산입니다. 매도가와 매수가가 동시에 계획대로 체결된다는 보장은 없고, 환전·세금은 반영하지 않았습니다. 매도 후
        바로 갈아탈 필요는 없습니다 — 현금 보유도 선택지입니다.
      </p>
    </Section>
  );
}
