// 서버 전용: 종목 한 개에 대한 종합 분석
// 하락 이유 + 재무 + 적정가 모델(시나리오·신뢰도) + 과거 회복탄력성 + 매매 계획 + 자동 평가표 + 단기·장기 등급
import { computeSnapshot } from "./analysis";
import { analyzeDrop, periodReturn, type Benchmark, type DropAnalysis } from "./dropReason";
import { getFundamentals, getNews, getPeers } from "./fundamentals";
import { longGrade, shortGrade, type HorizonGrade } from "./grades";
import { SECTOR_ETF, SECTOR_KO } from "./ko";
import { analyzeResilience, type Resilience } from "./resilience";
import { autoScore, finalScore, RED_FLAGS, type AutoScore, type MarketEnv } from "./scorecard";
import { buildTradePlan, type TradePlan } from "./tradePlan";
import type { ChartData, Fundamentals, Snapshot } from "./types";
import { dcfSensitivity, earningsOutlook, fairValueModel, type Sensitivity, type Valuation } from "./valuation";
import { fetchChart } from "./yahoo";

export interface Insight {
  symbol: string;
  fundamentals: Fundamentals | null;
  drop: DropAnalysis;
  auto: AutoScore;
  sectorKo: string | null;
  valuation: Valuation;
  sensitivity: Sensitivity | null;
  resilience: Resilience;
  plan: TradePlan;
  env: MarketEnv;
  blocked: string | null;
  grades: { short: HorizonGrade; long: HorizonGrade };
}

async function bench(symbol: string, label: string): Promise<(Benchmark & { snap: Snapshot }) | null> {
  try {
    const c = await fetchChart(symbol, "2y");
    return { label, ret1m: periodReturn(c.bars, 21), ret3m: periodReturn(c.bars, 63), snap: computeSnapshot(c.bars, c.meta.price) };
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
  // 인수·합병·대규모 증자 같은 특수상황: 인수 후 재무구조를 자동으로 계산할 수 없으므로 알리고 신뢰도를 한 단계 낮춘다
  const SPECIAL_RE = /\b(acquir\w*|merger|to buy|buyout|takeover|public offering|share offering|convertible)\b/i;
  const special = news.filter((n) => SPECIAL_RE.test(n.title) && n.time * 1000 > Date.now() - 60 * 86400_000).slice(0, 3);
  if (special.length && valuation.fairValue != null) {
    valuation.notes.unshift(
      `특수상황 확인 필요: 최근 뉴스에 인수·합병·증자 관련 내용이 있습니다("${special[0].title}"). 인수 대금·신규 차입·신주 발행은 아직 재무제표에 반영되지 않았을 수 있어, 인수 후 재무구조로 다시 계산해야 합니다.`,
    );
    const lower = { high: "mid", mid: "low", low: "low" } as const;
    const level = lower[valuation.confidence.level];
    valuation.confidence = {
      level,
      label: { high: "신뢰도 높음", mid: "신뢰도 보통", low: "신뢰도 낮음" }[level],
      reasons: [...valuation.confidence.reasons, "인수·합병·증자 진행 중 — 재무구조 변화 미반영 (한 단계 낮춤)"],
    };
  }
  const resilience = analyzeResilience(long?.bars ?? data.bars);
  const bear = valuation.scenarios.find((s) => s.key === "bear") ?? null;
  const bull = valuation.scenarios.find((s) => s.key === "bull") ?? null;

  const env: MarketEnv = {
    spyAbove200: market?.snap.sma200 != null ? market.snap.price > market.snap.sma200 : null,
    spyAbove50: market?.snap.sma50 != null ? market.snap.price > market.snap.sma50 : null,
    sectorVsMarket1m: sector?.ret1m != null && market?.ret1m != null ? sector.ret1m - market.ret1m : null,
  };

  const plan = buildTradePlan({
    bars: data.bars,
    snap,
    res: resilience,
    fairValue: valuation.fairValue,
    bearValue: bear?.fairValue ?? null,
    confidence: valuation.confidence.level,
    beta: f?.beta ?? null,
    marketCap: f?.marketCap ?? null,
    fcfNegative: f?.freeCashflow != null && f.freeCashflow < 0,
  });
  const supports = [...plan.supports.map((l) => l.price), ...plan.volumeNodes.map((l) => l.price)];
  const auto = autoScore(f, snap, drop, valuation, resilience, env, supports);

  // 단기·장기 등급 (자동 점수 기준) → 수익 잠재력 15점
  const r0 = finalScore(auto, {}, snap.price);
  const flags = RED_FLAGS.filter((x) => r0.flagsOn[x.key]).map((x) => x.label);
  const blocked = flags.length ? `회피 신호(${flags.join("·")})` : r0.longTermOk === false ? "장기 보유 기준 미달" : null;
  const grades = {
    short: shortGrade({
      technical: r0.scores.technical ?? 0,
      res: resilience,
      dropNature: drop.nature,
      beta: f?.beta ?? null,
      plan,
      marketUp: env.spyAbove200,
    }),
    long: longGrade({
      upside: valuation.upside,
      bearUpside: bear?.upside ?? null,
      bullUpside: bull?.upside ?? null,
      growth: r0.scores.growth ?? null,
      balance: r0.scores.balance ?? null,
      outlook: f ? earningsOutlook(f).kind : "ok",
      dilution: f?.sharesChangeYoY ?? null,
      res: resilience,
      blocked,
    }),
  };
  const pot = Math.round((grades.short.score / 100) * 9 + (grades.long.score / 100) * 6);
  auto.scores.potential = pot;
  auto.reasons.potential = [
    `단기(1~4주) 수익성 ${grades.short.score}/100 (${grades.short.grade}) × 9% = ${((grades.short.score / 100) * 9).toFixed(1)}`,
    `장기(3~12개월) 수익성 ${grades.long.score}/100 (${grades.long.grade}) × 6% = ${((grades.long.score / 100) * 6).toFixed(1)}`,
  ];

  return {
    symbol: sym,
    fundamentals: f,
    drop,
    auto,
    sectorKo,
    valuation,
    sensitivity: dcfSensitivity(f),
    resilience,
    plan,
    env,
    blocked,
    grades,
  };
}

/** 추천 목록용 요약 점수 (사용자 수정 없이 자동 점수만) */
export function autoFinal(insight: Insight, price: number) {
  return finalScore(insight.auto, {}, price);
}
