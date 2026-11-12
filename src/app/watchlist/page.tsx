"use client";
import Ago from "@/components/Ago";
import Link from "next/link";
import { useState } from "react";
import SymbolSearch from "@/components/SymbolSearch";
import { Chip, Empty, PageHeader, RsiChip, TONE_CLASS } from "@/components/ui";
import { TREND_LABEL, zoneStatus } from "@/lib/analysis";
import { money, pct, toneOf } from "@/lib/format";
import { setData, uid, useAppData, useHydrated } from "@/lib/store";
import type { WatchItem } from "@/lib/types";
import { isQuote, useQuotes } from "@/lib/useQuotes";

export default function WatchlistPage() {
  const app = useAppData();
  const hydrated = useHydrated();
  const { quotes, loading, fetchedAt, refresh } = useQuotes(app.watchlist.map((w) => w.symbol));

  const add = (symbol: string) => {
    if (app.watchlist.some((w) => w.symbol === symbol)) return;
    setData((d) => ({ ...d, watchlist: [...d.watchlist, { id: uid(), symbol, zones: [] }] }));
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="관심 종목 & 가격대 계획"
        desc="가격대마다 ‘왜 이 가격에서 관심을 갖는지’와 확인할 조건을 함께 적어 둡니다. 관심 가격은 무조건 매수 가격이 아닙니다."
        actions={
          <button className="btn" onClick={refresh} disabled={loading}>
            {loading ? "불러오는 중…" : <>시세 새로고침{fetchedAt && <> · <Ago t={fetchedAt} /></>}</>}
          </button>
        }
      />
      <div className="card p-4">
        <SymbolSearch onPick={add} placeholder="관심 종목 추가 — 티커 또는 회사명" />
      </div>

      {!hydrated ? (
        <div className="card h-40 animate-pulse" />
      ) : app.watchlist.length === 0 ? (
        <div className="card">
          <Empty>관심 종목이 없습니다. 위에서 종목을 검색해 추가하세요.</Empty>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {app.watchlist.map((w) => (
            <WatchCard key={w.id} item={w} quote={quotes[w.symbol]} />
          ))}
        </div>
      )}
    </div>
  );
}

function WatchCard({ item, quote }: { item: WatchItem; quote: ReturnType<typeof useQuotes>["quotes"][string] | undefined }) {
  const q = isQuote(quote) ? quote : null;
  const price = q?.price ?? null;
  const research = useAppData().research[item.symbol];
  const [draft, setDraft] = useState({ label: "", low: "", high: "", condition: "" });

  const update = (fn: (w: WatchItem) => WatchItem) =>
    setData((d) => ({ ...d, watchlist: d.watchlist.map((x) => (x.id === item.id ? fn(x) : x)) }));

  const addZone = () => {
    const low = Number(draft.low);
    const high = Number(draft.high || draft.low);
    if (!(low > 0) || !(high > 0)) return;
    update((w) => ({
      ...w,
      zones: [
        ...w.zones,
        { id: uid(), label: draft.label || "관심 구간", low: Math.min(low, high), high: Math.max(low, high), condition: draft.condition },
      ].sort((a, b) => b.high - a.high),
    }));
    setDraft({ label: "", low: "", high: "", condition: "" });
  };

  const remove = () => {
    if (!confirm(`${item.symbol}을(를) 관심 종목에서 삭제할까요?`)) return;
    setData((d) => ({ ...d, watchlist: d.watchlist.filter((x) => x.id !== item.id) }));
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/analyze/${item.symbol}`} className="text-lg font-semibold hover:text-accent">{item.symbol}</Link>
          <div className="text-xs text-muted truncate">{q?.nameKo ?? q?.name ?? (quote && "error" in quote ? quote.error : "")}</div>
        </div>
        <div className="text-right num shrink-0">
          <div className="text-lg font-semibold">{money(price, q?.currency)}</div>
          <div className={`text-xs ${toneOf(q?.changePct)}`}>{pct(q?.changePct)}</div>
        </div>
      </div>

      {research?.lastScored ? (
        <Link
          href={`/analyze/${item.symbol}`}
          className={`mt-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${TONE_CLASS[research.lastTone ?? "neutral"]}`}
        >
          <span className="num font-semibold text-text">{research.lastTotal}점</span>
          <span>{research.lastGrade}</span>
        </Link>
      ) : (
        <Link href={`/analyze/${item.symbol}`} className="mt-3 block text-xs text-muted hover:text-accent">
          이중 투자전략 평가 보기 →
        </Link>
      )}

      {q && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <RsiChip value={q.rsi} />
          <Chip tone={q.trend === "down" ? "bad" : q.trend === "up" ? "good" : "neutral"}>{TREND_LABEL[q.trend]}</Chip>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${TONE_CLASS[q.verdict.tone]}`}>{q.verdict.title}</span>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {item.zones.length === 0 && <p className="text-sm text-muted">가격대 계획이 없습니다.</p>}
        {item.zones.map((z) => {
          const st = zoneStatus(price, z);
          return (
            <div
              key={z.id}
              className={`rounded-lg border p-2.5 text-sm ${st.tone === "warn" ? "border-warn/50 bg-warn/5" : "border-line"}`}
            >
              <div className="flex items-center gap-2">
                <span className="num font-medium">
                  {money(z.low)}{z.low !== z.high && `~${money(z.high)}`}
                </span>
                <span>{z.label}</span>
                {st.text && <Chip tone={st.tone}>{st.text}</Chip>}
                <button
                  className="ml-auto text-xs text-muted hover:text-bad"
                  onClick={() => update((w) => ({ ...w, zones: w.zones.filter((x) => x.id !== z.id) }))}
                  aria-label="구간 삭제"
                >
                  삭제
                </button>
              </div>
              {z.condition && <div className="text-xs text-muted mt-1">조건: {z.condition}</div>}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[1fr_5rem_5rem] gap-1.5 mt-3 text-sm">
        <input placeholder="이름 (1차 관심)" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        <input type="number" step="0.01" placeholder="하단" value={draft.low} onChange={(e) => setDraft({ ...draft, low: e.target.value })} />
        <input type="number" step="0.01" placeholder="상단" value={draft.high} onChange={(e) => setDraft({ ...draft, high: e.target.value })} />
        <input
          className="col-span-2"
          placeholder="확인할 조건 (지지·종가 회복 확인)"
          value={draft.condition}
          onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && addZone()}
        />
        <button className="btn justify-center" onClick={addZone}>+ 구간</button>
      </div>

      <textarea
        className="w-full mt-3 text-sm"
        rows={2}
        placeholder="메모 — 하락 이유, 장기 보유 논리 등"
        value={item.note ?? ""}
        onChange={(e) => update((w) => ({ ...w, note: e.target.value }))}
      />
      <div className="flex justify-between mt-2">
        <Link href={`/analyze/${item.symbol}`} className="text-sm text-accent">상세 분석 →</Link>
        <button className="text-xs text-muted hover:text-bad" onClick={remove}>관심 종목에서 삭제</button>
      </div>
    </div>
  );
}
