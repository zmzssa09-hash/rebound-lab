// 단기(1~4주)·장기(3~12개월) 수익성 평가 — 각각 100점 만점, S+~F 등급
// 단기 목표가(저항선 기준)와 장기 적정가(가치평가 기준)는 서로 다른 개념이다.
import type { Resilience } from "./resilience";
import { letterOf, type LetterGrade } from "./scorecard";
import type { TradePlan } from "./tradePlan";
import type { Tone } from "./types";

export interface HorizonGrade {
  horizon: "short" | "long";
  period: string;
  grade: LetterGrade;
  label: string;
  tone: Tone;
  score: number; // 0~100
  expected: string; // 기대 수익 근거 한 줄
  parts: string[];
}

const toneOf = (score: number): Tone => (score >= 70 ? "good" : score >= 55 ? "warn" : "bad");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sp = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
const pr = (v: number | null) => (v == null ? "–" : `${(v * 100).toFixed(0)}%`);

const NATURE_PTS: Record<string, number> = { external: 10, none: 7, unclear: 7, event: 5, earnings: 3, fundamental: 1 };

/** 단기 (1~4주): 기술적 분석 25 + 과거 과매도 뒤 4주 성과 25 + 손익비 15 + 1차 목표 도달 확률 15 + 하락 성격 10 + 변동성 10 */
export function shortGrade(input: {
  technical: number; // 0~15
  res: Resilience;
  dropNature: string;
  beta: number | null;
  plan: TradePlan | null;
  marketUp: boolean | null; // S&P 500이 200일선 위인가
}): HorizonGrade {
  const parts: string[] = [];
  const t = (input.technical / 15) * 25;
  parts.push(`기술적 분석 ${input.technical}/15 → ${t.toFixed(0)}/25`);

  let h: number;
  if (input.res.n >= 2 && input.res.winRate20 != null) {
    const m = clamp(input.res.medianRet20 ?? 0, -10, 15);
    h = input.res.winRate20 * 15 + ((m + 10) / 25) * 10;
    parts.push(`과거 과매도 ${input.res.n}회: 4주 뒤 상승 확률 ${pr(input.res.winRate20)}, 수익 중앙값 ${sp(input.res.medianRet20)} → ${h.toFixed(0)}/25`);
  } else {
    h = 12;
    parts.push("과거 과매도 사례 부족 → 중립 12/25");
  }

  const rr = input.plan?.rr ?? null;
  const rrPts = rr == null ? 6 : rr >= 3 ? 15 : rr >= 2 ? 12 : rr >= 1.5 ? 9 : rr >= 1 ? 5 : 1;
  parts.push(rr == null ? "손익비 계산 불가 → 6/15" : `손익비 ${rr.toFixed(1)} (1차 목표까지 상승폭 ÷ 손절폭) → ${rrPts}/15`);

  const t1 = input.plan?.t1 ?? null;
  const hit = t1?.firstRate ?? null;
  const hitPts = hit == null ? 7 : hit * 15;
  parts.push(
    hit == null
      ? "1차 목표 도달 확률 계산 불가 (과거 사례 부족) → 7/15"
      : `과거 과매도 뒤 20거래일 안에 손절선보다 1차 목표(${sp(t1!.pct)})에 먼저 도달 ${pr(hit)} → ${hitPts.toFixed(0)}/15`,
  );

  const nat = NATURE_PTS[input.dropNature] ?? 5;
  parts.push(`하락 성격(외부 요인일수록 빠른 반등 기대) → ${nat}/10`);
  let b = input.beta == null ? 5 : input.beta <= 1.5 ? 10 : input.beta <= 2 ? 7 : 3;
  if (input.marketUp === false) {
    b = Math.max(0, b - 3);
    parts.push(`변동성(베타 ${input.beta?.toFixed(2) ?? "–"}) · 약세장 −3 → ${b}/10`);
  } else parts.push(`변동성(베타 ${input.beta?.toFixed(2) ?? "–"}) → ${b}/10`);

  const score = Math.round(clamp(t + h + rrPts + hitPts + nat + b, 0, 100));
  const g = letterOf(score);
  const label = score >= 80 ? "단기 반등 유력" : score >= 65 ? "단기 반등 기대" : score >= 50 ? "단기 불확실" : "단기 비추천";
  return {
    horizon: "short",
    period: "1~4주",
    grade: g,
    label,
    tone: toneOf(score),
    score,
    expected: t1
      ? `1차 목표 ${sp(t1.pct)}${t1.hitRate != null ? ` (과거 도달 ${pr(t1.hitRate)}${t1.medianDays != null ? `, 보통 ${Math.round(t1.medianDays)}거래일` : ""})` : ""}` +
        (input.plan?.stop ? ` · 손절 ${sp(input.plan.stop.pct)}` : "")
      : input.res.n >= 2
        ? `과거 비슷한 과매도 뒤 4주 ${sp(input.res.medianRet20)} (중앙값)`
        : "과거 사례 부족 — 기술적 신호 위주 판단",
    parts,
  };
}

/** 장기 (3~12개월): 상승 여력 25 + 보수적 시나리오 10 + 기업의 질 30 + 이익 전망 10 + 희석 위험 5 + 과거 12개월 성과 20 */
export function longGrade(input: {
  upside: number | null; // 기준 적정가 대비 %
  bearUpside: number | null; // 보수적 적정가 대비 %
  bullUpside: number | null;
  growth: number | null; // 0~15
  balance: number | null; // 0~15
  outlook: "ok" | "decline" | "collapse";
  dilution: number | null; // 1년간 주식 수 변화
  res: Resilience;
  blocked: string | null; // 회피 신호·장기 보유 부적합이면 F
}): HorizonGrade {
  const parts: string[] = [];
  const u = input.upside == null ? 8 : (clamp(input.upside, 0, 60) / 60) * 25;
  parts.push(input.upside == null ? "적정가 계산 불가 → 8/25" : `기준 적정가까지 상승 여력 ${sp(input.upside)} → ${u.toFixed(0)}/25`);
  const bu = input.bearUpside == null ? 3 : (clamp(input.bearUpside, -20, 30) + 20) / 5;
  parts.push(input.bearUpside == null ? "보수적 시나리오 계산 불가 → 3/10" : `보수적 적정가 대비 ${sp(input.bearUpside)} (하방 여유) → ${bu.toFixed(0)}/10`);
  const q = ((input.growth ?? 7) / 15) * 15 + ((input.balance ?? 7) / 15) * 15;
  parts.push(`기업의 질(성장성 ${input.growth ?? "–"}/15 · 재무 ${input.balance ?? "–"}/15) → ${q.toFixed(0)}/30`);
  const o = input.outlook === "ok" ? 10 : input.outlook === "decline" ? 3 : 0;
  parts.push(`내년 이익 전망 ${input.outlook === "ok" ? "유지·성장" : input.outlook === "decline" ? "감소" : "적자 전환"} → ${o}/10`);
  const d = input.dilution;
  const dp = d == null ? 3 : d <= 0.02 ? 5 : d <= 0.05 ? 3 : d <= 0.1 ? 1 : 0;
  parts.push(d == null ? "주식 희석 확인 불가 → 3/5" : `1년간 주식 수 ${sp(d * 100)} → ${dp}/5`);
  let h: number;
  const r = input.res;
  const w = r.winRate250;
  const m = r.medianRet250 ?? r.medianRet60;
  if (r.n >= 2 && m != null) {
    h = (w ?? 0.5) * 12 + ((clamp(m, -20, 40) + 20) / 60) * 8;
    parts.push(`과거 과매도 뒤 ${r.medianRet250 != null ? "12개월" : "3개월"} 수익 중앙값 ${sp(m)}${w != null ? `, 상승 확률 ${pr(w)}` : ""} → ${h.toFixed(0)}/20`);
  } else {
    h = 10;
    parts.push("과거 장기 성과 사례 부족 → 중립 10/20");
  }
  let score = Math.round(clamp(u + bu + q + o + dp + h, 0, 100));
  if (input.blocked) {
    score = Math.min(score, 40);
    parts.push(`${input.blocked} → F등급`);
  }
  const g = input.blocked ? "F" : letterOf(score);
  const label = input.blocked ? "장기 부적합" : score >= 80 ? "장기 보유 유망" : score >= 65 ? "장기 보유 적합" : score >= 50 ? "장기 보통" : "장기 부적합";
  return {
    horizon: "long",
    period: "3~12개월",
    grade: g,
    label,
    tone: input.blocked ? "bad" : toneOf(score),
    score,
    expected:
      input.upside != null
        ? `기준 적정가까지 ${sp(input.upside)}` + (input.bearUpside != null && input.bullUpside != null ? ` (보수 ${sp(input.bearUpside)} ~ 낙관 ${sp(input.bullUpside)})` : "")
        : "적정가 계산 불가",
    parts,
  };
}
