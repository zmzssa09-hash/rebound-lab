// 종목 평가표 (100점 만점)
// 배점 기준이며 실제 점수는 재무·시세 자료를 확인한 뒤 산정한다.
import type { DropAnalysis } from "./dropReason";
import type { Resilience } from "./resilience";
import type { Fundamentals, Snapshot, Tone } from "./types";
import { MODEL_NAME, type Valuation } from "./valuation";

export interface Band {
  range: string;
  text: string;
}

export interface ScoreItem {
  key: string;
  label: string;
  max: number;
  guide: string;
  bands: Band[];
}

export const SCORE_ITEMS: ScoreItem[] = [
  {
    key: "growth",
    label: "기업 실적 및 성장성",
    max: 25,
    guide: "최근 매출·이익 성장률, 분기 매출 추이, 가이던스",
    bands: [
      { range: "21~25", text: "매출 20% 이상 성장 또는 10%대 성장 + 이익 성장" },
      { range: "13~20", text: "성장은 둔화됐지만 매출 증가와 수익성은 유지" },
      { range: "6~12", text: "매출 정체 또는 일시적 감소, 가이던스 하향" },
      { range: "0~5", text: "매출 감소가 이어지거나 적자가 확대" },
    ],
  },
  {
    key: "discount",
    label: "적정가 대비 할인율",
    max: 25,
    guide: "이중 투자전략 적정가 모델 1.0(DCF 40%·상대가치 30%·성장성 20%·위험 조정 10%) 대비 현재가 할인율",
    bands: [
      { range: "25", text: "40% 이상 할인" },
      { range: "22", text: "30~40% 할인" },
      { range: "18", text: "20~30% 할인" },
      { range: "13", text: "10~20% 할인" },
      { range: "8", text: "0~10% 할인" },
      { range: "4", text: "0~10% 고평가" },
      { range: "0", text: "10% 넘게 고평가" },
    ],
  },
  {
    key: "balance",
    label: "재무건전성",
    max: 15,
    guide: "순현금·부채, FCF와 FCF 마진, 유동비율",
    bands: [
      { range: "13~15", text: "순현금 + FCF 흑자(마진 10% 이상) + 유동성 충분" },
      { range: "8~12", text: "부채 관리 가능, FCF 흑자" },
      { range: "4~7", text: "FCF 적자지만 현금으로 버틸 여력 있음" },
      { range: "0~3", text: "현금 소진, 부채 과다, 증자 위험" },
    ],
  },
  {
    key: "technical",
    label: "기술적 과매도 신호",
    max: 10,
    guide: "RSI 수준 + 안정 신호(MACD 개선·매도 거래량 진정·저점 유지)",
    bands: [
      { range: "RSI", text: "25 이하 4점 · 30 이하 3점 · 35 이하 2점" },
      { range: "안정 신호", text: "개당 2점 (최대 6점) — RSI 40 이하일 때만 인정" },
    ],
  },
  {
    key: "resilience",
    label: "과거 회복탄력성",
    max: 10,
    guide: "최근 10년간 이 종목이 과매도(RSI ≤ 30)에 빠졌을 때 얼마나, 얼마나 빨리 회복했는가",
    bands: [
      { range: "회복 비율", text: "60거래일 안에 하락 전 고점 회복: 70%↑ 4점 · 50%↑ 3점 · 30%↑ 2점" },
      { range: "회복 속도", text: "회복 기간 중앙값: 20거래일 이내 3점 · 40일 2점 · 60일 1점" },
      { range: "4주 승률", text: "과매도 4주 뒤 플러스 확률: 60%↑ 3점 · 50%↑ 2점 · 40%↑ 1점" },
      { range: "사례 부족", text: "과거 사례 2회 미만이면 중립 5점" },
    ],
  },
  {
    key: "catalyst",
    label: "향후 상승 촉매",
    max: 5,
    guide: "다가오는 실적 발표, 호재 뉴스, 업종 흐름 (애널리스트 의견은 사용하지 않음)",
    bands: [
      { range: "4~5", text: "시점이 구체적인 촉매가 있음" },
      { range: "2~3", text: "가능성은 있지만 시점이 불확실" },
      { range: "0~1", text: "뚜렷한 촉매가 없음" },
    ],
  },
  {
    key: "downside",
    label: "하방 위험 및 안전마진",
    max: 10,
    guide: "공매도 비율, 변동성(베타), 현금 소진·증자 위험, 부채, 소송·허가 이슈",
    bands: [
      { range: "8~10", text: "하락 여지가 작고 손절 기준이 명확" },
      { range: "4~7", text: "일부 위험이 있지만 감당 가능" },
      { range: "0~3", text: "큰 하방 위험(공매도 과다·희석·부채·소송)이 있음" },
    ],
  },
];

/** 회피 신호: 하나라도 해당하면 RSI가 아무리 낮아도 피한다 */
export const RED_FLAGS = [
  { key: "revenue", label: "매출 감소", detail: "일시적 요인이 아닌 구조적 매출 감소" },
  { key: "cashflow", label: "현금흐름 악화", detail: "영업현금흐름·FCF가 지속적으로 악화" },
  { key: "moat", label: "경쟁력 상실", detail: "점유율 하락, 대체 기술 등장, 핵심 제품 경쟁력 훼손" },
] as const;

export type FlagKey = (typeof RED_FLAGS)[number]["key"];

export function discountOf(price: number, fairValue?: number | null): number | null {
  if (!fairValue || fairValue <= 0) return null;
  return ((fairValue - price) / fairValue) * 100;
}

export function discountScore(discount: number | null): number | null {
  if (discount == null) return null;
  if (discount >= 40) return 25;
  if (discount >= 30) return 22;
  if (discount >= 20) return 18;
  if (discount >= 10) return 13;
  if (discount >= 0) return 8;
  if (discount >= -10) return 4;
  return 0;
}

export function technicalScore(s: Snapshot): { score: number; parts: string[] } {
  const parts: string[] = [];
  if (s.rsi == null) return { score: 0, parts: ["RSI 데이터 부족"] };
  let score = 0;
  if (s.rsi <= 25) score += 4;
  else if (s.rsi <= 30) score += 3;
  else if (s.rsi <= 35) score += 2;
  parts.push(`RSI ${s.rsi.toFixed(1)} → ${score}점`);
  if (s.rsi <= 40) {
    const macd = s.macdCrossDaysAgo != null || (s.macdHist != null && s.macdHistPrev != null && s.macdHist > s.macdHistPrev);
    const vol = s.downDayVolRatio != null && s.downDayVolRatio <= 0.9;
    const support = s.low3m != null && s.priorLow3m != null && s.low3m >= s.priorLow3m;
    const stab = [macd, vol, support].filter(Boolean).length;
    score += stab * 2;
    parts.push(`안정 신호 ${stab}/3 (MACD ${macd ? "○" : "×"} · 거래량 ${vol ? "○" : "×"} · 저점 ${support ? "○" : "×"}) → ${stab * 2}점`);
  } else {
    parts.push("RSI 40 초과 — 과매도 신호 없음");
  }
  return { score: Math.min(score, 10), parts };
}

// ───────── 자동 채점 (재무 데이터 기반, 직접 수정 가능) ─────────

export interface AutoScore {
  scores: Record<string, number | null>;
  reasons: Record<string, string[]>;
  fairValue: number | null;
  fairValueSource: string | null;
  flags: Partial<Record<FlagKey, string>>; // 데이터로 확인된 회피 신호 (자동 적용)
  suspects: Partial<Record<FlagKey, string>>; // 뉴스 키워드로 의심되는 신호 (확인 필요)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pc = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const usd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}M` : `$${a.toFixed(0)}`;
  return v < 0 ? `-${s}` : s;
};

export function autoScore(
  f: Fundamentals | null,
  snap: Snapshot,
  drop: Pick<DropAnalysis, "tagCounts" | "suggestedFlags" | "nature" | "sector"> | null,
  valuation: Valuation | null,
  res: Resilience | null,
): AutoScore {
  const reasons: Record<string, string[]> = {};
  const scores: Record<string, number | null> = {};
  const tags = new Set((drop?.tagCounts ?? []).map((t) => t.key));

  const tech = technicalScore(snap);
  scores.technical = tech.score;
  reasons.technical = tech.parts;

  scores.resilience = res ? res.score : 5;
  reasons.resilience = res ? res.scoreParts : ["과거 가격 데이터를 받지 못해 중립 5점"];

  const fairValue = valuation?.fairValue ?? null;
  const disc = discountOf(snap.price, fairValue);
  scores.discount = discountScore(disc);
  reasons.discount = fairValue
    ? [
        `${MODEL_NAME} 적정가 $${fairValue.toFixed(2)} 기준 ${disc! >= 0 ? `${disc!.toFixed(1)}% 할인` : `${(-disc!).toFixed(1)}% 고평가`}`,
        "계산 근거는 ‘적정가 계산’ 패널에서 확인할 수 있고, 직접 계산한 적정가로 바꿔 넣을 수도 있습니다.",
      ]
    : ["적정가를 계산할 재무 데이터가 부족합니다. 적정가를 직접 입력하세요."];

  const suspectsFromNews = (exclude: AutoScore["flags"]) => {
    const out: AutoScore["suspects"] = {};
    for (const [k, v] of Object.entries(drop?.suggestedFlags ?? {})) if (v && !exclude[k as FlagKey]) out[k as FlagKey] = v;
    return out;
  };

  if (!f) {
    for (const k of ["growth", "balance", "catalyst", "downside"]) {
      scores[k] = null;
      reasons[k] = ["재무 데이터를 받지 못했습니다. 직접 채점하세요."];
    }
    return { scores, reasons, fairValue, fairValueSource: fairValue ? MODEL_NAME : null, flags: {}, suspects: suspectsFromNews({}) };
  }

  // 실적 및 성장성 (25)
  {
    const r: string[] = [];
    const rg = f.revenueGrowth;
    let s: number | null = null;
    if (rg != null) {
      s = rg >= 0.2 ? 21 : rg >= 0.1 ? 17 : rg >= 0.03 ? 13 : rg >= 0 ? 9 : rg >= -0.1 ? 5 : 2;
      r.push(`매출 성장률(전년 동기 대비) ${pc(rg)} → 기본 ${s}점`);
      if (f.earningsGrowth != null && f.earningsGrowth > 0.1 && (f.operatingMargin ?? 0) > 0) {
        s += 3;
        r.push(`이익 성장 ${pc(f.earningsGrowth)}, 영업이익률 ${pc(f.operatingMargin!)} → +3`);
      }
      if (f.operatingMargin != null && f.operatingMargin < -0.2) {
        s -= 3;
        r.push(`영업이익률 ${pc(f.operatingMargin)} (큰 적자) → -3`);
      }
      const q = f.quarterlyRevenue;
      if (q.length >= 2 && q[0].revenue < q[1].revenue * 0.95) {
        s -= 2;
        r.push(`최근 분기 매출이 직전 분기보다 ${(((q[0].revenue - q[1].revenue) / q[1].revenue) * 100).toFixed(1)}% 감소 → -2`);
      }
      if (tags.has("guidance") || tags.has("slowdown")) {
        s -= 2;
        r.push("최근 뉴스에 가이던스 하향·성장 둔화 → -2");
      }
      s = clamp(s, 0, 25);
    } else r.push("매출 성장률 데이터 없음 — 직접 채점하세요.");
    scores.growth = s;
    reasons.growth = r;
  }

  // 재무건전성 (15)
  {
    const r: string[] = [];
    if (f.cash == null && f.freeCashflow == null) {
      scores.balance = null;
      r.push("현금·현금흐름 데이터 없음 — 직접 채점하세요.");
    } else {
      let s = 0;
      const cash = f.cash ?? 0;
      const debt = f.debt ?? 0;
      if (cash - debt > 0) {
        s += 6;
        r.push(`순현금 ${usd(cash - debt)} (현금 ${usd(cash)}, 부채 ${usd(debt)}) → +6`);
      } else if (debt <= cash * 2) {
        s += 3;
        r.push(`순부채 ${usd(debt - cash)}, 관리 가능한 수준 → +3`);
      } else r.push(`부채 ${usd(debt)}가 현금 ${usd(cash)}의 2배 이상 → 0`);
      const fcf = f.freeCashflow;
      if (fcf != null) {
        if (fcf > 0) {
          s += 5;
          r.push(`FCF 흑자 ${usd(fcf)} → +5`);
          if (f.revenue && fcf / f.revenue > 0.1) {
            s += 2;
            r.push(`FCF 마진 ${pc(fcf / f.revenue)} → +2`);
          }
        } else if (cash > Math.abs(fcf) * 2) {
          s += 2;
          r.push(`FCF 적자 ${usd(fcf)}지만 현금으로 2년 이상 버팀 → +2`);
        } else r.push(`FCF 적자 ${usd(fcf)}, 현금 여력 2년 미만 → 0`);
      }
      if (f.currentRatio != null && f.currentRatio >= 1.5) {
        s += 2;
        r.push(`유동비율 ${f.currentRatio.toFixed(1)} → +2`);
      }
      scores.balance = clamp(s, 0, 15);
    }
    reasons.balance = r;
  }

  // 향후 상승 촉매 (5) — 애널리스트 의견 없이 일정·뉴스·업종 흐름만 사용
  {
    const r: string[] = [];
    let s = 0;
    const now = Date.now() / 1000;
    if (f.earningsDate && f.earningsDate > now && f.earningsDate - now < 75 * 86400) {
      s += 2;
      r.push(`다음 실적 발표 ${new Date(f.earningsDate * 1000).toLocaleDateString("ko-KR")} (75일 이내) → +2`);
    }
    if (tags.has("positive")) {
      s += 1;
      r.push("최근 뉴스에 호재 → +1");
    }
    if (drop?.nature === "external") {
      s += 1;
      r.push("시장·업종 탓 하락 → 시장 회복 시 함께 반등 여지 +1");
    }
    if (drop?.sector?.ret1m != null && drop.sector.ret1m > 0) {
      s += 1;
      r.push(`${drop.sector.label} 최근 1개월 ${drop.sector.ret1m.toFixed(1)}% 상승 (업종 흐름 우호) → +1`);
    }
    if (!r.length) r.push("자동으로 확인된 촉매 없음");
    r.push("신제품·허가·보험급여 같은 구체적 촉매는 직접 확인해 점수를 조정하세요.");
    scores.catalyst = clamp(s, 0, 5);
    reasons.catalyst = r;
  }

  // 하방 위험 및 안전마진 (10)
  {
    const r: string[] = [];
    let s = 10;
    if (f.shortPercentFloat != null && f.shortPercentFloat > 0.2) {
      s -= 3;
      r.push(`공매도 비율 ${pc(f.shortPercentFloat)} (높음) → -3`);
    } else if (f.shortPercentFloat != null && f.shortPercentFloat > 0.1) {
      s -= 1;
      r.push(`공매도 비율 ${pc(f.shortPercentFloat)} → -1`);
    }
    if (f.beta != null && f.beta > 2) {
      s -= 2;
      r.push(`베타 ${f.beta.toFixed(2)} (변동성 큼) → -2`);
    } else if (f.beta != null && f.beta > 1.5) {
      s -= 1;
      r.push(`베타 ${f.beta.toFixed(2)} → -1`);
    }
    if (f.freeCashflow != null && f.freeCashflow < 0) {
      s -= 2;
      r.push("FCF 적자 (증자·희석 위험) → -2");
    }
    if (f.debt != null && f.cash != null && f.marketCap && f.debt > f.cash && f.debt - f.cash > f.marketCap * 0.5) {
      s -= 2;
      r.push("순부채가 시가총액의 50% 초과 → -2");
    }
    if (tags.has("legal") || tags.has("fda") || tags.has("dilution")) {
      s -= 1;
      r.push("최근 뉴스에 소송·허가·증자 이슈 → -1");
    }
    if (!r.length) r.push("자동으로 확인된 큰 하방 위험 없음");
    scores.downside = clamp(s, 0, 10);
    reasons.downside = r;
  }

  // 회피 신호: 데이터로 확인된 것만 자동 적용
  const flags: AutoScore["flags"] = {};
  if (f.revenueGrowth != null && f.revenueGrowth < -0.02) flags.revenue = `매출이 전년 동기 대비 ${pc(f.revenueGrowth)} 감소`;
  if (f.freeCashflow != null && f.freeCashflow < 0 && f.operatingCashflow != null && f.operatingCashflow < 0)
    flags.cashflow = `영업현금흐름(${usd(f.operatingCashflow)})과 FCF(${usd(f.freeCashflow)}) 모두 적자`;

  return {
    scores,
    reasons,
    fairValue,
    fairValueSource: fairValue ? MODEL_NAME : null,
    flags,
    suspects: suspectsFromNews(flags),
  };
}

// ───────── 종합 판정 ─────────

export interface Grade {
  title: string;
  tone: Tone;
  summary: string;
}

export interface ScoreResult {
  scores: Record<string, number | null>;
  total: number;
  scored: number;
  complete: boolean;
  longTermOk: boolean | null;
  grade: Grade;
}

export function computeScore(scores: Record<string, number | null>, redFlags: Partial<Record<string, boolean>>): ScoreResult {
  const values = SCORE_ITEMS.map((it) => scores[it.key] ?? null);
  const total = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const scored = values.filter((v) => v != null).length;
  const complete = scored === SCORE_ITEMS.length;

  const flags = RED_FLAGS.filter((f) => redFlags[f.key]).map((f) => f.label);
  const growth = scores.growth ?? null;
  const balance = scores.balance ?? null;
  const longTermOk = flags.length > 0 ? false : growth == null || balance == null ? null : growth >= 13 && balance >= 8;

  let grade: Grade;
  if (flags.length > 0) {
    grade = { title: "회피", tone: "bad", summary: `하락 원인이 ${flags.join("·")}입니다. RSI가 아무리 낮아도 피합니다.` };
  } else if (longTermOk === false) {
    grade = {
      title: "장기 보유 부적합 — 진입하지 않음",
      tone: "bad",
      summary: `${growth! < 13 ? "실적·성장성" : "재무건전성"} 점수가 기준(절반) 미만입니다. 단기 반등에 실패하면 장기 보유할 근거가 없으므로 진입하지 않습니다.`,
    };
  } else if (!complete) {
    grade = { title: `평가 진행 중 (${scored}/${SCORE_ITEMS.length})`, tone: "neutral", summary: "모든 항목이 채점되어야 최종 판단을 내릴 수 있습니다." };
  } else if (total >= 80) {
    grade = { title: "우수 — 진입 검토", tone: "good", summary: "장기 보유 기준을 통과했고 점수도 높습니다. 거래 전 체크리스트와 손절 기준을 정한 뒤 진입을 검토하세요." };
  } else if (total >= 65) {
    grade = { title: "양호 — 분할 접근 검토", tone: "good", summary: "장기 보유 기준은 통과했습니다. 약한 항목이 개선되는지 보면서 분할 접근을 검토하세요." };
  } else if (total >= 50) {
    grade = { title: "보류 — 근거 보강 필요", tone: "warn", summary: "기업은 보유할 만하지만 가격·타이밍 근거가 약합니다. 할인율이나 기술적 신호가 좋아질 때까지 기다립니다." };
  } else {
    grade = { title: "제외", tone: "bad", summary: "종합 점수가 낮습니다. 다른 후보를 찾는 편이 낫습니다." };
  }
  return { scores, total, scored, complete, longTermOk, grade };
}

/** 자동 점수 + 사용자 수정 + 회피 신호를 합쳐 최종 결과 계산 */
export function finalScore(
  auto: AutoScore,
  overrides: { scores?: Record<string, number>; fairValue?: number; redFlags?: Partial<Record<string, boolean>> },
  price: number,
): ScoreResult & { flagsOn: Record<string, boolean>; fairValue: number | null } {
  const scores: Record<string, number | null> = { ...auto.scores };
  const fairValue = overrides.fairValue ?? auto.fairValue;
  if (overrides.fairValue) scores.discount = discountScore(discountOf(price, overrides.fairValue));
  for (const [k, v] of Object.entries(overrides.scores ?? {})) scores[k] = v;
  const flagsOn: Record<string, boolean> = {};
  for (const f of RED_FLAGS) flagsOn[f.key] = overrides.redFlags?.[f.key] ?? !!auto.flags[f.key];
  return { ...computeScore(scores, flagsOn), flagsOn, fairValue };
}
