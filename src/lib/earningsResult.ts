// 최근 실적 한 줄 요약 — 애널리스트 예상치는 쓰지 않고 '1년 전 같은 분기'와만 비교한다
import { koUnits } from "./ko";
import type { LastQuarter, Tone } from "./types";

export interface EarningsSummary {
  quarter: string; // "2026년 6~8월 분기"
  label: string; // 좋음 · 나쁨 · 엇갈림
  tone: Tone;
  headline: string;
  lines: string[];
}

function quarterKo(end: string) {
  const [y, m] = end.split("-").map(Number);
  const start = ((m - 3 + 12) % 12) + 1;
  return `${y}년 ${start}~${m}월 분기`;
}

const money = (v: number, cur: string) => (cur === "USD" ? `${koUnits(v)} 달러` : `${koUnits(v)} ${cur}`);
const eps = (v: number, cur: string) => (cur === "USD" ? `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}` : `${v.toFixed(2)} ${cur}`);

export function summarizeEarnings(q: LastQuarter | null | undefined, currency: string | null = "USD"): EarningsSummary | null {
  if (!q) return null;
  const cur = currency ?? "USD";
  const lines: string[] = [];
  let up = 0;
  let down = 0;
  let parts = 0;

  if (q.revenue != null && q.revenuePrev != null && q.revenuePrev > 0) {
    const g = (q.revenue / q.revenuePrev - 1) * 100;
    parts++;
    if (g >= 2) up++;
    else if (g <= -2) down++;
    const word = g >= 2 ? "늘었습니다" : g <= -2 ? "줄었습니다" : "비슷합니다";
    lines.push(`매출 ${money(q.revenue, cur)} — 1년 전 같은 분기보다 ${g >= 0 ? "+" : ""}${g.toFixed(1)}%, ${word}`);
  }

  if (q.eps != null && q.epsPrev != null) {
    parts++;
    const a = q.eps;
    const b = q.epsPrev;
    let text: string;
    if (a >= 0 && b < 0) {
      up++;
      text = "적자에서 흑자로 돌아섰습니다";
    } else if (a < 0 && b >= 0) {
      down++;
      text = "흑자에서 적자로 바뀌었습니다";
    } else if (a < 0 && b < 0) {
      if (a > b * 0.9) up++;
      else if (a < b * 1.1) down++;
      text = a > b ? "적자지만 1년 전보다 줄었습니다" : a < b ? "적자가 1년 전보다 커졌습니다" : "적자가 이어지고 있습니다";
    } else {
      const g = b > 0 ? (a / b - 1) * 100 : 0;
      if (g >= 5) up++;
      else if (g <= -5) down++;
      text = g >= 5 ? `1년 전보다 ${g.toFixed(0)}% 늘었습니다` : g <= -5 ? `1년 전보다 ${Math.abs(g).toFixed(0)}% 줄었습니다` : "1년 전과 비슷합니다";
    }
    lines.push(`주당순이익(EPS) ${eps(b, cur)} → ${eps(a, cur)}, ${text}`);
  }

  if (parts === 0) return null;
  const label = up && down ? "엇갈림" : up >= 2 ? "좋음" : down >= 2 ? "나쁨" : up ? "다소 좋음" : down ? "다소 나쁨" : "비슷함";
  const tone: Tone = up && down ? "warn" : up ? "good" : down ? "bad" : "neutral";
  const headline =
    up && down
      ? "좋아진 것과 나빠진 것이 섞여 있습니다 — 다음 실적까지 지켜볼 필요가 있습니다."
      : up
        ? "1년 전보다 잘 벌었습니다 — 최근 하락이 실적 악화 때문은 아닐 가능성이 큽니다."
        : down
          ? "1년 전보다 못 벌었습니다 — 하락에 실적 악화가 섞여 있을 수 있으니 조심하세요."
          : "1년 전과 비슷하게 벌었습니다 — 실적 자체는 크게 달라지지 않았습니다.";
  return { quarter: quarterKo(q.end), label, tone, headline, lines };
}
