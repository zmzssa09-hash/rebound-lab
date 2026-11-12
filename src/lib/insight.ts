// 서버 전용: 종목 한 개에 대한 종합 분석
// 하락 이유 + 재무 + 적정가 모델 + 과거 회복탄력성 + 자동 평가표 + 단기·장기 등급
import { computeSnapshot } from "./analysis";
import { analyzeDrop, periodReturn, type Benchmark, type DropAnalysis } from "./dropReason";
import { getFundamentals, getNews, getPeers } from "./fundamentals";
import { longGrade, shortGrade, type HorizonGrade } from "./grades";
import { SECTOR_ETF, SECTOR_KO } from "./ko";
import { analyzeResilience, type Resilience } from "./resilience";
import { autoScore, finalScore, RED_FLAGS, type AutoScore } from "./scorecard";
import type { ChartData, Fundamentals } from "./types";
import { fairValueModel, type Valuation } from "./valuation";
import { fetchChart } from "./yahoo";

export interface Insight {
  symbol: string;
  fundamentals: Fundamentals | null;
  drop: DropAnalysis;
  auto: AutoScore;
  sectorKo: string | null;
  valuation: Valuation;
  resilience: Resilience;
  grades: { short: HorizonGrade; long: HorizonGrade };
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
  const [data, f, news, long] = await Promise.all([
    chart ? Promise.resolve(chart) : fetchChart(sym, "2y"),
    getFundamentals(sym).catch(() => null),
    getNews(sym).catch(() => []),
    fetchChart(sym, "10y").catch(() => null), // 과거 회복탄력성용 10년 일봉
  ]);
  const etf = f?.sector ? SECTOR_ETF[f.sector] : undefined;
  const sectorKo = f?.sector ? (SECTOR_KO[f.sector] ?? f.sector) : null;
  const [market, sector, peers] = await Promise.all([
    bench("SPY", "S&P 500"),
    etf && etf !== sym ? bench(etf, `${sectorKo} 업종(${etf})`) : Promise.resolve(null),
    f ? getPeers(sym, f.sector).catch(() => []) : Promise.resolve([]),
  ]);
  const drop = analyzeDrop(data.bars, news, { earningsDate: f?.earningsDate, market, sector });
  const snap = computeSnapshot(data.bars, data.meta.price, data.meta.previousClose);
  const valuation = fairValueModel(f, peers, snap.price, drop.nature === "fundamental");
  const resilience = analyzeResilience(long?.bars ?? data.bars);
  const auto = autoScore(f, snap, drop, valuation, resilience);

  // 단기·장기 등급 (자동 점수 기준)
  const r = finalScore(auto, {}, snap.price);
  const flags = RED_FLAGS.filter((x) => r.flagsOn[x.key]).map((x) => x.label);
  const blocked = flags.length ? `회피 신호(${flags.join("·")})` : r.longTermOk === false ? "장기 보유 기준 미달" : null;
  const grades = {
    short: shortGrade({ technical: r.scores.technical ?? 0, res: resilience, dropNature: drop.nature, beta: f?.beta ?? null }),
    long: longGrade({
      upside: valuation.upside,
      growth: r.scores.growth ?? null,
      balance: r.scores.balance ?? null,
      downside: r.scores.downside ?? null,
      res: resilience,
      blocked,
    }),
  };
  return { symbol: sym, fundamentals: f, drop, auto, sectorKo, valuation, resilience, grades };
}

/** 추천 목록용 요약 점수 (사용자 수정 없이 자동 점수만) */
export function autoFinal(insight: Insight, price: number) {
  return finalScore(insight.auto, {}, price);
}
