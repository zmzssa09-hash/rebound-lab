// 휴대폰 푸시 알림 (ntfy.sh — 가입 없는 무료 푸시 서비스)
// 사이트를 닫아도 받을 수 있도록, GitHub Actions가 분석을 마칠 때마다 이 주제(topic)로 알림을 보낸다.
// 휴대폰에 ntfy 앱을 설치하고 아래 주제를 구독하면 된다. 모든 사람이 같은 알림을 받는다(공개 추천 정보만 보냄).
import { actionOf, zoneOf } from "./tradePlan";
import type { Pick, PickExit } from "./types";
import type { PaperTrade } from "./paper";

export const NTFY_TOPIC = "rebound-lab-2u6pfxhu";
export const NTFY_WEB = `https://ntfy.sh/${NTFY_TOPIC}`;
export const SITE_URL = "https://rebound-lab.vercel.app";

const money = (n: number) => `$${n.toFixed(2)}`;
const BUY_TITLES = new Set(["적극 매수 검토", "분할 매수"]);

function actionTitle(p: Pick): string | null {
  if (!p.plan) return null;
  const price = p.live?.price ?? p.price;
  return actionOf({
    blocked: p.blocked ?? null,
    zone: zoneOf(p.plan.zones, price),
    price,
    stop: p.plan.stop?.price ?? null,
    rr: p.plan.rr,
    shortScore: p.shortGrade?.score ?? null,
    earningsAt: p.earningsDate ?? null,
  }).title;
}

/** 이번 분석에서 생긴 변화를 한 통의 알림 글로 정리 (변화가 없으면 null) */
export function buildDigest(input: {
  prevTop: Pick[];
  top: Pick[];
  newExits: PickExit[];
  paperTrades: PaperTrade[];
  /** 종목별 알림 기록 (같은 알림은 24시간에 한 번) — 호출 후 갱신된다 */
  seen?: Record<string, number>;
  now?: number;
}): { title: string; message: string } | null {
  const prev = new Map(input.prevTop.map((p) => [p.symbol, p]));
  const lines: string[] = [];
  const now = input.now ?? Date.now();
  const seen = input.seen ?? {};
  for (const k of Object.keys(seen)) if (now - seen[k] > 3 * 86_400_000) delete seen[k];
  /** 같은 종목·같은 종류 알림이 24시간 안에 이미 나갔으면 건너뜀 */
  const once = (key: string) => {
    if (seen[key] && now - seen[key] < 86_400_000) return false;
    seen[key] = now;
    return true;
  };
  const name = (p: { nameKo: string | null; name: string; symbol: string }) => `${p.nameKo ?? p.name}(${p.symbol})`;

  for (const p of input.top) {
    const before = prev.get(p.symbol);
    const price = p.live?.price ?? p.price;
    if (!before) {
      lines.push(`🆕 새 추천: ${name(p)} ${p.gradeLetter ?? ""} ${p.total}점 · ${money(price)}`);
      continue;
    }
    const nowAct = actionTitle(p);
    const prevAct = actionTitle(before);
    if (nowAct && BUY_TITLES.has(nowAct) && !(prevAct && BUY_TITLES.has(prevAct)) && once(`zone-${p.symbol}`)) lines.push(`🟢 매수 구간 진입: ${name(p)} ${money(price)} — ${nowAct}`);
    const stop = p.plan?.stop?.price;
    const prevPrice = before.live?.price ?? before.price;
    if (stop && price <= stop && prevPrice > stop && once(`stop-${p.symbol}`)) lines.push(`🔴 손절선 도달: ${name(p)} ${money(price)} ≤ ${money(stop)}`);
    const t1 = p.plan?.t1?.price;
    if (t1 && price >= t1 && prevPrice < t1 && once(`t1-${p.symbol}`)) lines.push(`🎯 1차 목표 도달: ${name(p)} ${money(price)} — 절반 이익 실현 검토`);
  }
  for (const e of input.newExits) lines.push(`⏏ 추천 종료: ${e.nameKo ?? e.name}(${e.symbol}) ${money(e.exitPrice)} — ${e.reason}`);
  for (const t of input.paperTrades)
    lines.push(`💼 모의투자 ${t.side === "buy" ? "매수" : "매도"}: ${t.name} ${t.shares}주 @ ${money(t.price)}${t.pnl != null ? ` (${t.pnl >= 0 ? "+" : ""}${money(t.pnl)})` : ""} — ${t.reason}`);

  if (!lines.length) return null;
  const title = lines.length === 1 ? lines[0].replace(/^\S+\s/, "") : `리바운드 랩: 새 소식 ${lines.length}건`;
  return { title: title.slice(0, 120), message: lines.slice(0, 15).join("\n") + (lines.length > 15 ? `\n…외 ${lines.length - 15}건` : "") };
}

/** ntfy로 보내기 (JSON 방식이라 한글 제목도 문제없음) */
export async function sendPush(d: { title: string; message: string }, click = `${SITE_URL}/picks`) {
  const res = await fetch("https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: NTFY_TOPIC, title: d.title, message: d.message, click, tags: ["chart_with_upwards_trend"] }),
  });
  if (!res.ok) throw new Error(`ntfy ${res.status}`);
}
