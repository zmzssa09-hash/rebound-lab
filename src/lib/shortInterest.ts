// 공매도 비중 경고: 유통주식 중 공매도 비율이 높으면 하루 변동이 커지기 쉽다
import type { Tone } from "./types";

export interface ShortRisk {
  tone: Tone;
  label: string;
  text: string;
}

/** pct: 유통주식 대비 공매도 비율(소수, 0.15 = 15%) · days: 공매도 청산에 걸리는 일수(평균 거래량 기준) */
export function shortRisk(pct: number | null | undefined, days?: number | null): ShortRisk | null {
  if (pct == null || !Number.isFinite(pct) || pct < 0.1) return null;
  const p = `${(pct * 100).toFixed(0)}%`;
  const d = days != null && Number.isFinite(days) && days >= 1 ? ` 다 갚으려면 평소 거래량으로 약 ${days.toFixed(0)}일이 걸립니다.` : "";
  if (pct >= 0.2)
    return {
      tone: "bad",
      label: `공매도 많음 ${p}`,
      text: `유통 주식의 ${p}가 공매도(주가 하락에 거는 거래)입니다.${d} 하루에 위아래로 크게 튈 수 있어, 사더라도 평소보다 적게 사고 손절가를 꼭 지키세요.`,
    };
  return {
    tone: "warn",
    label: `공매도 다소 많음 ${p}`,
    text: `유통 주식의 ${p}가 공매도(주가 하락에 거는 거래)입니다.${d} 보통 종목보다 변동이 클 수 있습니다.`,
  };
}
