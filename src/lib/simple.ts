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

/** 이미 산 사람에게: 계속 들고 있기 / 절반 팔기 / 손절하기 */
export function holderAdvice(i: {
  buy: number;
  price: number;
  stop: number | null;
  t1: number | null;
  t2: number | null;
  blocked: string | null;
  earningsDays: number | null;
}): { title: string; dot: string; tone: Tone; text: string } {
  const gain = (i.price - i.buy) / i.buy;
  const m = (v: number) => `$${v.toFixed(2)}`;
  if (i.stop != null && i.price <= i.stop)
    return { title: "손절하기", dot: "🔴", tone: "bad", text: `손절가 ${m(i.stop)} 아래로 내려왔습니다. 계획대로 정리하세요. "다시 오르겠지" 하고 버티면 손실이 더 커지기 쉽습니다.` };
  if (i.blocked)
    return { title: "정리 검토", dot: "🔴", tone: "bad", text: `새 위험 신호가 생겼습니다: ${i.blocked}. 추가로 사지 말고, 반등할 때 줄이는 것을 검토하세요.` };
  if (i.t2 != null && i.price >= i.t2)
    return { title: "대부분 팔기", dot: "🎯", tone: "good", text: `2차 목표 ${m(i.t2)}에 닿았습니다. 반등 목표를 다 채웠으니 대부분 이익을 실현하세요.` };
  if (i.t1 != null && i.price >= i.t1)
    return {
      title: "절반 팔기",
      dot: "🎯",
      tone: "good",
      text: `1차 목표 ${m(i.t1)}에 닿았습니다. 절반을 팔아 이익을 확정하고, 나머지는 손절가를 산 가격 ${m(i.buy)}으로 올려 손해 없이 들고 가세요.${i.t2 != null ? ` 남은 절반은 2차 목표 ${m(i.t2)}에서 팝니다.` : ""}`,
    };
  if (i.earningsDays != null && i.earningsDays <= 3 && gain >= 0.05)
    return {
      title: "일부 이익 실현 검토",
      dot: "🟡",
      tone: "warn",
      text: `${i.earningsDays === 0 ? "오늘" : `${i.earningsDays}일 뒤`} 실적 발표가 있습니다. 지금 ${(gain * 100).toFixed(0)}% 이익이니, 발표 전에 일부를 팔아 두면 하루 급락 위험을 줄일 수 있습니다.`,
    };
  if (i.stop == null)
    return { title: "손절가부터 정하기", dot: "🟡", tone: "warn", text: "이 종목은 손절 기준을 계산할 수 없습니다. 산 가격보다 10% 아래 정도에 손절가를 직접 정해 두세요." };
  return {
    title: "계속 들고 있기",
    dot: "🟢",
    tone: "neutral",
    text: `계획대로 기다리면 됩니다. 종가가 손절가 ${m(i.stop)} 아래로 내려가면 팔고${i.t1 != null ? `, 1차 목표 ${m(i.t1)}에 닿으면 절반 팝니다` : ""}. 그 사이 흔들림은 신경 쓰지 않아도 됩니다.`,
  };
}
