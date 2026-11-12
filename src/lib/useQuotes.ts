"use client";
import { useCallback, useEffect, useState } from "react";
import type { DropAnalysis } from "./dropReason";
import type { HorizonGrade } from "./grades";
import type { Resilience } from "./resilience";
import type { Sensitivity, Valuation } from "./valuation";
import type { AutoScore, MarketEnv } from "./scorecard";
import type { TradePlan } from "./tradePlan";
import type { ChartData, Fundamentals, QuoteError, QuoteSummary } from "./types";

/** /api/insight 응답 (서버 lib/insight.ts의 Insight와 같은 모양) */
export interface Insight {
  symbol: string;
  fundamentals: Fundamentals | null;
  drop: DropAnalysis;
  auto: AutoScore;
  sectorKo: string | null;
  valuation: Valuation;
  resilience: Resilience;
  grades: { short: HorizonGrade; long: HorizonGrade };
  sensitivity: Sensitivity | null;
  plan: TradePlan;
  env: MarketEnv;
  blocked: string | null;
}

/** 실시간 갱신 주기 */
export const LIVE_MS = 60_000;

export type QuoteMap =Record<string, QuoteSummary | QuoteError>;

export function isQuote(q: QuoteSummary | QuoteError | undefined): q is QuoteSummary {
  return !!q && !("error" in q);
}

export function useQuotes(symbols: string[]) {
  const key = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).sort().join(",");
  const [quotes, setQuotes] = useState<QuoteMap>({});
  const [loading, setLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((j: { quotes: (QuoteSummary | QuoteError)[]; fetchedAt: number }) => {
        if (!alive) return;
        const map: QuoteMap = {};
        j.quotes.forEach((q) => (map[q.symbol.toUpperCase()] = q));
        setQuotes((prev) => ({ ...prev, ...map }));
        setFetchedAt(j.fetchedAt);
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [key, tick]);

  // 실시간: 1분마다 자동 갱신
  useEffect(() => {
    if (!key) return;
    const t = setInterval(() => setTick((x) => x + 1), LIVE_MS);
    return () => clearInterval(t);
  }, [key]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { quotes, loading, fetchedAt, refresh };
}

export function useInsight(symbol: string) {
  const [data, setData] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/insight?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((j) => alive && !j.error && setData(j as Insight))
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol]);
  return { data, loading };
}

export function useChart(symbol: string) {
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    // 첫 로드만 로딩 표시, 이후 1분 주기 갱신은 화면을 유지한 채 교체
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tick === 0) setLoading(true);
    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "조회 실패");
        return j as ChartData;
      })
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => alive && tick === 0 && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [symbol, tick]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTick(0);
    const t = setInterval(() => setTick((x) => x + 1), LIVE_MS);
    return () => clearInterval(t);
  }, [symbol]);

  return { data, error, loading };
}
