// 단기(1~4주)·장기(3~12개월) 수익 등급
import type { Resilience } from "./resilience";
import type { Tone } from "./types";

export type GradeLetter = "A" | "B" | "C" | "D";

export interface HorizonGrade {
  horizon: "short" | "long";
  period: string;
  grade: GradeLetter;
  label: string;
  tone: Tone;
  score: number; // 0~100
  expected: string; // 기대 수익 근거 한 줄
  parts: string[];
}

const letter = (s: number): GradeLetter => (s >= 75 ? "A" : s >= 60 ? "B" : s >= 45 ? "C" : "D");
const toneOf = (g: GradeLetter): Tone => (g === "A" ? "good" : g === "B" ? "good" : g === "C" ? "warn" : "bad");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const sp = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

const NATURE_PTS: Record<string, number> = { external: 15, none: 10, unclear: 10, event: 8, earnings: 5, fundamental: 2 };

/** 단기 (1~4주): 기술적 반등 신호 + 과거 과매도 뒤 4주 성과 + 하락 성격 + 변동성 */
export function shortGrade(input: {
  technical: number; // 0~10
  res: Resilience;
  dropNature: string;
  beta: number | null;
}): HorizonGrade {
  const parts: string[] = [];
  const t = (input.technical / 10) * 30;
  parts.push(`기술적 과매도·안정 신호 ${input.technical}/10 → ${t.toFixed(0)}/30`);
  let h: number;
  if (input.res.n >= 2 && input.res.winRate20 != null) {
    const m = clamp(input.res.medianRet20 ?? 0, -10, 15);
    h = input.res.winRate20 * 25 + ((m + 10) / 25) * 15;
    parts.push(`과거 과매도 ${input.res.n}회: 4주 뒤 상승 확률 ${(input.res.winRate20 * 100).toFixed(0)}%, 수익 중앙값 ${sp(input.res.medianRet20)} → ${h.toFixed(0)}/40`);
  } else {
    h = 20;
    parts.push("과거 과매도 사례 부족 → 중립 20/40");
  }
  const nat = NATURE_PTS[input.dropNature] ?? 8;
  parts.push(`하락 성격(외부 요인일수록 빠른 반등 기대) → ${nat}/15`);
  const b = input.beta == null ? 8 : input.beta <= 1.5 ? 15 : input.beta <= 2 ? 10 : 5;
  parts.push(`변동성(베타 ${input.beta?.toFixed(2) ?? "–"}) → ${b}/15`);
  const score = Math.round(t + h + nat + b);
  const g = letter(score);
  const label = { A: "단기 반등 유력", B: "단기 반등 기대", C: "단기 불확실", D: "단기 비추천" }[g];
  return {
    horizon: "short",
    period: "1~4주",
    grade: g,
    label,
    tone: toneOf(g),
    score,
    expected:
      input.res.n >= 2
        ? `과거 비슷한 과매도 뒤 1주 ${sp(input.res.medianRet5)}, 4주 ${sp(input.res.medianRet20)} (중앙값)`
        : "과거 사례 부족 — 기술적 신호 위주 판단",
    parts,
  };
}

/** 장기 (3~12개월): 적정가 대비 상승 여력 + 기업의 질 + 과거 과매도 뒤 12개월 성과 */
export function longGrade(input: {
  upside: number | null; // 적정가 대비 %
  growth: number | null; // 0~25
  balance: number | null; // 0~15
  downside: number | null; // 0~10
  res: Resilience;
  blocked: string | null; // 회피 신호·장기 보유 부적합이면 D
}): HorizonGrade {
  const parts: string[] = [];
  const u = input.upside == null ? 10 : (clamp(input.upside, 0, 60) / 60) * 35;
  parts.push(input.upside == null ? "적정가 계산 불가 → 10/35" : `적정가 대비 상승 여력 ${sp(input.upside)} → ${u.toFixed(0)}/35`);
  const q = ((input.growth ?? 12) / 25) * 20 + ((input.balance ?? 7) / 15) * 15 + ((input.downside ?? 5) / 10) * 10;
  parts.push(`기업의 질(실적 ${input.growth ?? "–"}/25 · 재무 ${input.balance ?? "–"}/15 · 하방 위험 ${input.downside ?? "–"}/10) → ${q.toFixed(0)}/45`);
  let h: number;
  const r = input.res;
  const w = r.winRate250;
  const m = r.medianRet250 ?? r.medianRet60;
  if (r.n >= 2 && m != null) {
    h = (w ?? 0.5) * 12 + ((clamp(m, -20, 40) + 20) / 60) * 8;
    parts.push(`과거 과매도 뒤 ${r.medianRet250 != null ? "12개월" : "3개월"} 수익 중앙값 ${sp(m)}${w != null ? `, 상승 확률 ${(w * 100).toFixed(0)}%` : ""} → ${h.toFixed(0)}/20`);
  } else {
    h = 10;
    parts.push("과거 장기 성과 사례 부족 → 중립 10/20");
  }
  let score = Math.round(u + q + h);
  if (input.blocked) {
    score = Math.min(score, 30);
    parts.push(`${input.blocked} → D등급`);
  }
  const g = input.blocked ? "D" : letter(score);
  const label = { A: "장기 보유 유망", B: "장기 보유 적합", C: "장기 보통", D: "장기 부적합" }[g];
  return {
    horizon: "long",
    period: "3~12개월",
    grade: g,
    label,
    tone: toneOf(g),
    score,
    expected: input.upside != null ? `적정가까지 ${sp(input.upside)}` + (r.medianRet250 != null ? ` · 과거 과매도 뒤 12개월 ${sp(r.medianRet250)}` : "") : "적정가 계산 불가",
    parts,
  };
}
