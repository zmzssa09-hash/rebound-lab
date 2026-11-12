// 서버 전용: 종목 한 개에 대한 종합 분석 (하락 이유 + 재무 + 자동 평가표)
// 서버에서만 사용 (instrumentation 스케줄러에서도 불러오므로 server-only 표시는 쓰지 않음)
import { computeSnapshot } from "./analysis";
import { analyzeDrop, periodReturn, type Benchmark, type DropAnalysis } from "./dropReason";
import { getFundamentals, getNews } from "./fundamentals";
import { SECTOR_ETF, SECTOR_KO } from "./ko";
import { autoScore, finalScore, type AutoScore } from "./scorecard";
import type { ChartData, Fundamentals } from "./types";
import { fetchChart } from "./yahoo";

export interface Insight {
  symbol: string;
  fundamentals: Fundamentals | null;
  drop: DropAnalysis;
  auto: AutoScore;
  sectorKo: string | null;
}

async function bench(symbol: string, label: string): Promise<Benchmark | null> {
  try {
    const c = await fetchChart(symbol, "2y");
    return { label, ret1m: periodReturn(c.bars, 21), ret3m: periodReturn(c.bars, 63) };
  } catch {
    return null;
  }
}

export async function buildInsight(symbol: string, chart?: ChartData): Promise<Insight> {
  const sym = symbol.toUpperCase();
  const [data, f, news] = await Promise.all([
    chart ? Promise.resolve(chart) : fetchChart(sym, "2y"),
    getFundamentals(sym).catch(() => null),
    getNews(sym).catch(() => []),
  ]);
  const etf = f?.sector ? SECTOR_ETF[f.sector] : undefined;
  const sectorKo = f?.sector ? (SECTOR_KO[f.sector] ?? f.sector) : null;
  const [market, sector] = await Promise.all([
    bench("SPY", "S&P 500"),
    etf && etf !== sym ? bench(etf, `${sectorKo} 업종(${etf})`) : Promise.resolve(null),
  ]);
  const drop = analyzeDrop(data.bars, news, { earningsDate: f?.earningsDate, market, sector });
  const snap = computeSnapshot(data.bars, data.meta.price, data.meta.previousClose);
  const auto = autoScore(f, snap, drop);
  return { symbol: sym, fundamentals: f, drop, auto, sectorKo };
}

/** 추천 목록용 요약 점수 (사용자 수정 없이 자동 점수만) */
export function autoFinal(insight: Insight, price: number) {
  return finalScore(insight.auto, {}, price);
}
