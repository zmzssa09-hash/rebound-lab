// 이중 투자전략 평가 (100점 만점)
//   재무 안정성 15 · 성장성과 경쟁력 15 · 저평가 및 안전마진 15 · 기술적 분석 15
//   시장 환경 및 수급 10 · 수익 잠재력 15(단기 9 + 장기 6) · 가격 회복력 15
// 실제 점수는 재무·시세 자료를 확인한 뒤 자동 산정하며, 직접 수정할 수 있다.
import type { DropAnalysis } from "./dropReason";
import type { Resilience } from "./resilience";
import type { Fundamentals, Snapshot, Tone } from "./types";
import { earningsOutlook, isFinancialCo, MODEL_NAME, type Valuation } from "./valuation";

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
  auto?: boolean; // 자동 전용 (직접 수정 불가)
}

export const SCORE_ITEMS: ScoreItem[] = [
  {
    key: "balance",
    label: "재무 안정성",
    max: 15,
    guide: "순현금·부채, FCF와 FCF 마진, 유동비율, 주식 희석",
    bands: [
      { range: "13~15", text: "순현금 + FCF 흑자(마진 10% 이상) + 유동성 충분" },
      { range: "8~12", text: "부채 관리 가능, FCF 흑자" },
      { range: "4~7", text: "FCF 적자지만 현금으로 버틸 여력 있음" },
      { range: "0~3", text: "현금 소진, 부채 과다, 증자·희석 위험" },
    ],
  },
  {
    key: "growth",
    label: "성장성과 경쟁력",
    max: 15,
    guide: "매출 성장률, 총이익률(가격결정력), 이익 성장, 내년 이익 전망",
    bands: [
      { range: "12~15", text: "매출 20% 이상 성장 + 높은 총이익률 + 이익 성장" },
      { range: "8~11", text: "성장 둔화됐지만 매출 증가·수익성 유지" },
      { range: "4~7", text: "매출 정체, 이익 감소 전망" },
      { range: "0~3", text: "매출 감소가 이어지거나 적자 확대" },
    ],
  },
  {
    key: "value",
    label: "저평가 및 안전마진",
    max: 15,
    guide: "이중 투자전략 적정가 모델 대비 현재가 할인율 (보수적 적정가·신뢰도 반영)",
    bands: [
      { range: "15", text: "기준 적정가 대비 40% 이상 할인" },
      { range: "13", text: "30~40% 할인" },
      { range: "11", text: "20~30% 할인" },
      { range: "8", text: "10~20% 할인" },
      { range: "5", text: "0~10% 할인" },
      { range: "0~2", text: "적정가보다 비쌈" },
      { range: "가감", text: "보수적 적정가보다도 싸면 +2 · 적정가 신뢰도 낮으면 −2" },
    ],
  },
  {
    key: "technical",
    label: "기술적 분석",
    max: 15,
    guide: "RSI, 안정 신호(MACD·거래량·저점), ADX 추세 강도, 지지선·매물대",
    auto: true,
    bands: [
      { range: "RSI 4", text: "25 이하 4점 · 30 이하 3점 · 35 이하 2점" },
      { range: "안정 6", text: "MACD 개선·매도 거래량 진정·저점 유지 개당 2점 (RSI 40 이하일 때만)" },
      { range: "ADX 3", text: "하락 추세의 힘이 약해지는 중 3점 · 추세 약함(ADX 20 미만) 2점 · 매수세 우위 2점" },
      { range: "지지 2", text: "현재가가 지지선·매물대 위 5% 이내" },
    ],
  },
  {
    key: "market",
    label: "시장 환경 및 수급",
    max: 10,
    guide: "S&P 500 추세, 업종 상대강도, 공매도, 다가오는 촉매",
    bands: [
      { range: "시장 4", text: "S&P 500이 200일선 위 3점 + 50일선 위 1점" },
      { range: "업종 2", text: "업종 ETF가 최근 1개월 S&P 500보다 강함" },
      { range: "수급 2", text: "공매도 비율 5% 미만 2점 · 10% 미만 1점" },
      { range: "촉매 2", text: "75일 내 실적 발표 1점 · 최근 호재 뉴스 1점" },
    ],
  },
  {
    key: "potential",
    label: "수익 잠재력",
    max: 15,
    guide: "단기(1~4주) 수익성 점수 × 9 + 장기(3~12개월) 수익성 점수 × 6",
    auto: true,
    bands: [
      { range: "단기 9", text: "단기 수익성 100점 만점 점수를 9점으로 환산" },
      { range: "장기 6", text: "장기 수익성 100점 만점 점수를 6점으로 환산" },
    ],
  },
  {
    key: "resilience",
    label: "가격 회복력",
    max: 15,
    guide: "최근 10년간 과매도(RSI ≤ 30)에 빠졌을 때 얼마나, 얼마나 빨리 회복했는가",
    bands: [
      { range: "회복 비율", text: "60거래일 안에 하락 전 고점 회복: 70%↑ 6점 · 50%↑ 4.5점 · 30%↑ 3점" },
      { range: "회복 속도", text: "회복 기간 중앙값: 20거래일 이내 4.5점 · 40일 3점 · 60일 1.5점" },
      { range: "4주 승률", text: "과매도 4주 뒤 플러스 확률: 60%↑ 4.5점 · 50%↑ 3점 · 40%↑ 1.5점" },
      { range: "사례 부족", text: "과거 사례 2회 미만이면 중립 8점" },
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

/** 장기 보유 기준: 성장성 7점 이상 + 재무 안정성 8점 이상 */
export const LONG_TERM_MIN = { growth: 7, balance: 8 };

export function discountOf(price: number, fairValue?: number | null): number | null {
  if (!fairValue || fairValue <= 0) return null;
  return ((fairValue - price) / fairValue) * 100;
}

/** 저평가 및 안전마진 점수 (15) */
export function valueScore(
  price: number,
  fairValue: number | null,
  bear: number | null = null,
  confidence: "high" | "mid" | "low" | null = null,
): { score: number | null; parts: string[] } {
  const disc = discountOf(price, fairValue);
  if (disc == null) return { score: null, parts: ["적정가를 계산할 재무 데이터가 부족합니다. 적정가를 직접 입력하세요."] };
  let s = disc >= 40 ? 15 : disc >= 30 ? 13 : disc >= 20 ? 11 : disc >= 10 ? 8 : disc >= 0 ? 5 : disc >= -10 ? 2 : 0;
  const parts = [`${MODEL_NAME} 기준 적정가 $${fairValue!.toFixed(2)} 대비 ${disc >= 0 ? `${disc.toFixed(1)}% 할인` : `${(-disc).toFixed(1)}% 고평가`} → ${s}점`];
  if (bear && price <= bear) {
    s += 2;
    parts.push(`보수적 적정가 $${bear.toFixed(2)}보다도 싸서 안전마진 충분 → +2`);
  }
  if (confidence === "low") {
    s -= 2;
    parts.push("적정가 신뢰도 낮음 (자료 부족·방법별 차이 큼) → −2");
  }
  return { score: Math.max(0, Math.min(15, s)), parts };
}

/** 기술적 분석 점수 (15). supports: 지지선·매물대 가격 목록 */
export function technicalScore(s: Snapshot, supports: number[] = []): { score: number; parts: string[] } {
  const parts: string[] = [];
  if (s.rsi == null) return { score: 0, parts: ["RSI 데이터 부족"] };
  let score = 0;
  const rp = s.rsi <= 25 ? 4 : s.rsi <= 30 ? 3 : s.rsi <= 35 ? 2 : 0;
  score += rp;
  parts.push(`RSI ${s.rsi.toFixed(1)} → ${rp}점`);
  if (s.rsi <= 40) {
    const macd = s.macdCrossDaysAgo != null || (s.macdHist != null && s.macdHistPrev != null && s.macdHist > s.macdHistPrev);
    const vol = s.downDayVolRatio != null && s.downDayVolRatio <= 0.9;
    const support = s.low3m != null && s.priorLow3m != null && s.low3m >= s.priorLow3m;
    const stab = [macd, vol, support].filter(Boolean).length;
    score += stab * 2;
    parts.push(`안정 신호 ${stab}/3 (MACD ${macd ? "○" : "×"} · 거래량 ${vol ? "○" : "×"} · 저점 ${support ? "○" : "×"}) → ${stab * 2}점`);
  } else {
    parts.push("RSI 40 초과 — 과매도 안정 신호는 채점하지 않음");
  }
  if (s.adx != null && s.plusDI != null && s.minusDI != null) {
    let a = 0;
    let why: string;
    if (s.plusDI >= s.minusDI) {
      a = 2;
      why = "매수세(+DI)가 매도세(−DI)보다 우위";
    } else if (s.adx < 20) {
      a = 2;
      why = "추세가 약함 (횡보 — 하락 압력 약화)";
    } else if (s.adxPrev != null && s.adx < s.adxPrev) {
      a = 3;
      why = "하락 추세의 힘이 약해지는 중 (ADX 하락)";
    } else {
      why = s.adx >= 25 ? "하락 추세가 강하게 진행 중" : "하락 추세 유지";
    }
    score += a;
    parts.push(`ADX ${s.adx.toFixed(0)} (+DI ${s.plusDI.toFixed(0)} / −DI ${s.minusDI.toFixed(0)}): ${why} → ${a}점`);
  } else parts.push("ADX 계산 불가 (고가·저가 데이터 부족)");
  const near = supports.filter((x) => x <= s.price && x >= s.price * 0.95);
  if (near.length) {
    score += 2;
    parts.push(`지지선·매물대($${Math.max(...near).toFixed(2)}) 바로 위 (5% 이내) → 2점`);
  } else parts.push("가까운 지지선·매물대 없음 → 0점");
  return { score: Math.min(score, 15), parts };
}

// ───────── 자동 채점 (재무 데이터 기반, 직접 수정 가능) ─────────

export interface MarketEnv {
  spyAbove200: boolean | null;
  spyAbove50: boolean | null;
  sectorVsMarket1m: number | null; // 업종 1개월 수익률 − S&P 500 1개월 수익률 (%p)
}

export interface AutoScore {
  scores: Record<string, number | null>;
  reasons: Record<string, string[]>;
  fairValue: number | null;
  bearValue: number | null;
  confidence: "high" | "mid" | "low" | null;
  supports: number[];
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
  drop: Pick<DropAnalysis, "tagCounts" | "suggestedFlags" | "nature" | "sector" | "market"> | null,
  valuation: Valuation | null,
  res: Resilience | null,
  env: MarketEnv | null = null,
  supports: number[] = [],
): AutoScore {
  const reasons: Record<string, string[]> = {};
  const scores: Record<string, number | null> = {};
  const tags = new Set((drop?.tagCounts ?? []).map((t) => t.key));

  const tech = technicalScore(snap, supports);
  scores.technical = tech.score;
  reasons.technical = tech.parts;

  // 가격 회복력 (15) = 회복탄력성 10점 만점 × 1.5
  scores.resilience = res ? Math.round(res.score * 1.5) : 8;
  reasons.resilience = res ? [...res.scoreParts, `회복탄력성 ${res.score}/10 × 1.5 = ${Math.round(res.score * 1.5)}/15`] : ["과거 가격 데이터를 받지 못해 중립 8점"];

  const fairValue = valuation?.fairValue ?? null;
  const bearValue = valuation?.scenarios.find((s) => s.key === "bear")?.fairValue ?? null;
  const confidence = valuation?.fairValue != null ? valuation.confidence.level : null;
  const vs = valueScore(snap.price, fairValue, bearValue, confidence);
  scores.value = vs.score;
  reasons.value = vs.parts;

  // 시장 환경 및 수급 (10)
  {
    const r: string[] = [];
    let s = 0;
    if (env?.spyAbove200 != null) {
      if (env.spyAbove200) {
        s += 3;
        r.push("S&P 500이 200일선 위 (상승장) → +3");
      } else r.push("S&P 500이 200일선 아래 (약세장 — 반등 실패 위험 큼) → 0");
      if (env.spyAbove50) {
        s += 1;
        r.push("S&P 500이 50일선 위 → +1");
      }
    } else r.push("시장 지수 데이터 없음");
    if (env?.sectorVsMarket1m != null) {
      if (env.sectorVsMarket1m >= 0) {
        s += 2;
        r.push(`업종이 최근 1개월 시장보다 ${env.sectorVsMarket1m.toFixed(1)}%p 강함 → +2`);
      } else r.push(`업종이 최근 1개월 시장보다 ${(-env.sectorVsMarket1m).toFixed(1)}%p 약함 → 0`);
    }
    const sp = f?.shortPercentFloat;
    if (sp != null) {
      const p = sp < 0.05 ? 2 : sp < 0.1 ? 1 : 0;
      s += p;
      r.push(`공매도 비율 ${pc(sp)} → ${p}점${sp > 0.2 ? " (매우 높음 — 변동성 주의)" : ""}`);
    }
    const now = Date.now() / 1000;
    if (f?.earningsDate && f.earningsDate > now && f.earningsDate - now < 75 * 86400) {
      s += 1;
      r.push(`다음 실적 발표 ${new Date(f.earningsDate * 1000).toLocaleDateString("ko-KR")} (75일 이내 촉매) → +1`);
    }
    if (tags.has("positive")) {
      s += 1;
      r.push("최근 뉴스에 호재 → +1");
    }
    scores.market = clamp(s, 0, 10);
    reasons.market = r;
  }

  // 수익 잠재력은 단기·장기 등급 계산 뒤 채운다 (insight.ts)
  scores.potential = null;
  reasons.potential = [];

  const suspectsFromNews = (exclude: AutoScore["flags"]) => {
    const out: AutoScore["suspects"] = {};
    for (const [k, v] of Object.entries(drop?.suggestedFlags ?? {})) if (v && !exclude[k as FlagKey]) out[k as FlagKey] = v;
    return out;
  };
  const base = { fairValue, bearValue, confidence, supports, fairValueSource: fairValue ? MODEL_NAME : null };

  if (!f) {
    for (const k of ["growth", "balance"]) {
      scores[k] = null;
      reasons[k] = ["재무 데이터를 받지 못했습니다. 직접 채점하세요."];
    }
    return { scores, reasons, ...base, flags: {}, suspects: suspectsFromNews({}) };
  }

  // 성장성과 경쟁력 (15)
  {
    const r: string[] = [];
    const rg = f.revenueGrowth;
    let s: number | null = null;
    if (rg != null) {
      if (rg > 1) {
        s = 7;
        r.push(`매출 성장률 ${pc(rg)} — 일회성 급증 가능성이 있어 기본 7점`);
      } else {
        s = rg >= 0.2 ? 9 : rg >= 0.1 ? 7 : rg >= 0.03 ? 5 : rg >= 0 ? 3 : rg >= -0.1 ? 1 : 0;
        r.push(`매출 성장률(전년 동기 대비) ${pc(rg)} → 기본 ${s}점`);
      }
      const gm = f.grossMargin;
      if (gm != null) {
        const g = gm >= 0.5 ? 2 : gm >= 0.3 ? 1 : 0;
        s += g;
        r.push(`총이익률 ${pc(gm)} (가격결정력·경쟁력) → +${g}`);
      }
      if (f.earningsGrowth != null && f.earningsGrowth > 0.1 && (f.operatingMargin ?? 0) > 0) {
        s += 2;
        r.push(`이익 성장 ${pc(f.earningsGrowth)}, 영업이익률 ${pc(f.operatingMargin!)} → +2`);
      }
      const out = earningsOutlook(f);
      if (out.kind === "collapse") {
        s -= 3;
        r.push(`내년 예상 EPS $${f.forwardEps!.toFixed(2)} — 적자 전환 전망 → −3`);
      } else if (out.kind === "decline") {
        s -= 2;
        r.push(`내년 예상 이익이 ${Math.round((1 - out.ratio!) * 100)}% 감소 전망 → −2`);
      }
      if (f.operatingMargin != null && f.operatingMargin < -0.2) {
        s -= 2;
        r.push(`영업이익률 ${pc(f.operatingMargin)} (큰 적자) → −2`);
      }
      const q = f.quarterlyRevenue;
      if (q.length >= 2 && q[0].revenue < q[1].revenue * 0.95) {
        s -= 1;
        r.push(`최근 분기 매출이 직전 분기보다 ${(((q[0].revenue - q[1].revenue) / q[1].revenue) * 100).toFixed(1)}% 감소 → −1`);
      }
      if (tags.has("guidance") || tags.has("slowdown")) {
        s -= 1;
        r.push("최근 뉴스에 가이던스 하향·성장 둔화 → −1");
      }
      s = clamp(s, 0, 15);
    } else r.push("매출 성장률 데이터 확인 불가 — 직접 채점하세요.");
    scores.growth = s;
    reasons.growth = r;
  }

  // 재무 안정성 (15)
  {
    const r: string[] = [];
    if (isFinancialCo(f)) {
      scores.balance = 9;
      r.push("금융회사는 예금·차입이 영업 자산이라 일반 부채·현금흐름 기준을 적용하지 않습니다 → 중립 9점");
      r.push("자기자본비율·부실채권 비율은 공시(10-Q)에서 직접 확인하고 필요하면 점수를 고치세요.");
    } else if (f.cash == null && f.freeCashflow == null) {
      scores.balance = null;
      r.push("현금·현금흐름 데이터 확인 불가 — 직접 채점하세요.");
    } else {
      let s = 0;
      const cash = f.cash ?? 0;
      const debt = f.debt ?? 0;
      if (cash - debt > 0) {
        s += 6;
        r.push(`순현금 ${usd(cash - debt)} (현금·단기투자 ${usd(cash)}, 차입금 ${usd(debt)}) → +6`);
      } else if (debt <= cash * 2) {
        s += 3;
        r.push(`순부채 ${usd(debt - cash)}, 관리 가능한 수준 → +3`);
      } else r.push(`차입금 ${usd(debt)}가 현금 ${usd(cash)}의 2배 이상 → 0`);
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
      const dil = f.sharesChangeYoY;
      if (dil != null && dil > 0.1) {
        s -= 3;
        r.push(`1년간 주식 수 ${pc(dil)} 증가 (주주가치 희석 큼) → −3`);
      } else if (dil != null && dil > 0.04) {
        s -= 1;
        r.push(`1년간 주식 수 ${pc(dil)} 증가 (희석) → −1`);
      } else if (dil != null) r.push(`1년간 주식 수 변화 ${pc(dil)} (희석 없음)`);
      scores.balance = clamp(s, 0, 15);
    }
    reasons.balance = r;
  }

  // 회피 신호: 데이터로 확인된 것만 자동 적용
  const flags: AutoScore["flags"] = {};
  if (f.revenueGrowth != null && f.revenueGrowth < -0.02) flags.revenue = `매출이 전년 동기 대비 ${pc(f.revenueGrowth)} 감소`;
  if (!isFinancialCo(f) && f.freeCashflow != null && f.freeCashflow < 0 && f.operatingCashflow != null && f.operatingCashflow < 0)
    flags.cashflow = `영업현금흐름(${usd(f.operatingCashflow)})과 FCF(${usd(f.freeCashflow)}) 모두 적자`;

  return { scores, reasons, ...base, flags, suspects: suspectsFromNews(flags) };
}

// ───────── 등급 ─────────

export type LetterGrade = "S+" | "S" | "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D" | "F";

export function letterOf(score: number): LetterGrade {
  if (score >= 95) return "S+";
  if (score >= 90) return "S";
  if (score >= 85) return "A+";
  if (score >= 80) return "A";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "C+";
  if (score >= 60) return "C";
  if (score >= 55) return "D+";
  if (score >= 50) return "D";
  return "F";
}

export const GRADE_SCALE: [LetterGrade, string][] = [
  ["S+", "95~100"],
  ["S", "90~94"],
  ["A+", "85~89"],
  ["A", "80~84"],
  ["B+", "75~79"],
  ["B", "70~74"],
  ["C+", "65~69"],
  ["C", "60~64"],
  ["D+", "55~59"],
  ["D", "50~54"],
  ["F", "0~49"],
];

export interface Grade {
  letter: LetterGrade | null;
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
  const values = SCORE_ITEMS.map((it) => (scores[it.key] == null ? null : clamp(scores[it.key]!, 0, it.max)));
  const total = values.reduce<number>((a, v) => a + (v ?? 0), 0);
  const scored = values.filter((v) => v != null).length;
  const complete = scored === SCORE_ITEMS.length;

  const flags = RED_FLAGS.filter((f) => redFlags[f.key]).map((f) => f.label);
  const growth = scores.growth ?? null;
  const balance = scores.balance ?? null;
  const longTermOk = flags.length > 0 ? false : growth == null || balance == null ? null : growth >= LONG_TERM_MIN.growth && balance >= LONG_TERM_MIN.balance;
  const letter = letterOf(total);

  let grade: Grade;
  if (flags.length > 0) {
    grade = { letter: "F", title: "F · 회피", tone: "bad", summary: `하락 원인이 ${flags.join("·")}입니다. RSI가 아무리 낮아도 피합니다.` };
  } else if (longTermOk === false) {
    grade = {
      letter: "F",
      title: "F · 장기 보유 부적합",
      tone: "bad",
      summary: `${growth! < LONG_TERM_MIN.growth ? "성장성과 경쟁력" : "재무 안정성"} 점수가 기준 미만입니다. 단기 반등에 실패하면 장기 보유할 근거가 없으므로 진입하지 않습니다.`,
    };
  } else if (!complete) {
    grade = { letter: null, title: `평가 진행 중 (${scored}/${SCORE_ITEMS.length})`, tone: "neutral", summary: "모든 항목이 채점되어야 최종 판단을 내릴 수 있습니다." };
  } else if (total >= 80) {
    grade = { letter, title: `${letter} · 우수`, tone: "good", summary: "장기 보유 기준을 통과했고 점수도 높습니다. 매수 구간과 손절선을 확인한 뒤 진입을 검토하세요." };
  } else if (total >= 65) {
    grade = { letter, title: `${letter} · 양호`, tone: "good", summary: "장기 보유 기준은 통과했습니다. 약한 항목이 개선되는지 보면서 분할 접근을 검토하세요." };
  } else if (total >= 50) {
    grade = { letter, title: `${letter} · 보류`, tone: "warn", summary: "기업은 보유할 만하지만 가격·타이밍 근거가 약합니다. 할인율이나 기술적 신호가 좋아질 때까지 기다립니다." };
  } else {
    grade = { letter, title: `${letter} · 제외`, tone: "bad", summary: "종합 점수가 낮습니다. 다른 후보를 찾는 편이 낫습니다." };
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
  if (overrides.fairValue) scores.value = valueScore(price, overrides.fairValue).score;
  for (const [k, v] of Object.entries(overrides.scores ?? {})) {
    const item = SCORE_ITEMS.find((it) => it.key === k);
    if (item && !item.auto) scores[k] = clamp(v, 0, item.max); // 예전 평가표 키·자동 전용 항목은 무시
  }
  const flagsOn: Record<string, boolean> = {};
  for (const f of RED_FLAGS) flagsOn[f.key] = overrides.redFlags?.[f.key] ?? !!auto.flags[f.key];
  return { ...computeScore(scores, flagsOn), flagsOn, fairValue };
}
