// 초보자용 쉬운 판정: '지금 해야 할 일'을 사도 됨 / 기다리기 / 사지 않기 세 가지로 줄인다.
import { actionOf, earningsDaysLeft, zoneOf } from "./tradePlan";
import type { Pick, Tone } from "./types";

export type SimpleKey = "buy" | "wait" | "avoid";

export const SIMPLE_INFO: Record<SimpleKey, { label: string; dot: string; tone: Tone }> = {
  buy: { label: "사도 됨", dot: "🟢", tone: "good" },
  wait: { label: "기다리기", dot: "🟡", tone: "warn" },
  avoid: { label: "사지 않기", dot: "🔴", tone: "bad" },
};

export function simpleKeyOf(actionTitle: string): SimpleKey {
  if (actionTitle === "적극 매수 검토" || actionTitle === "분할 매수") return "buy";
  if (actionTitle === "사지 않음" || actionTitle === "손절선 이탈") return "avoid";
  return "wait"; // 관찰 · 실적 발표 대기 · 매수 보류
}

/** 추천 종목의 지금 판정 (실시간 가격 기준) */
export function pickVerdict(p: Pick) {
  const price = p.live?.price ?? p.price;
  const plan = p.plan ?? null;
  const zone = plan ? zoneOf(plan.zones, price) : null;
  const act = actionOf({
    blocked: p.blocked ?? null,
    zone,
    price,
    stop: plan?.stop?.price ?? null,
    rr: plan?.rr ?? null,
    shortScore: p.shortGrade?.score ?? null,
    earningsAt: p.earningsDate ?? null,
  });
  const key = simpleKeyOf(act.title);
  // 살 가격: 지금 매수 구간이면 현재가, 아니면 분할 매수 구간 윗선까지 내려와야 함
  const buyAt = key === "buy" ? price : plan?.zones && key === "wait" && act.title !== "실적 발표 대기" ? Math.min(plan.zones.splitMax, price) : null;
  const stop = plan?.stop?.price ?? null;
  return {
    price,
    zone,
    act,
    key,
    info: SIMPLE_INFO[key],
    buyAt,
    stop,
    t1: plan?.t1?.price ?? null,
    nearStop: stop != null && price > stop && price <= stop * 1.03,
    earningsDays: earningsDaysLeft(p.earningsDate),
  };
}

export type PickVerdict = ReturnType<typeof pickVerdict>;
