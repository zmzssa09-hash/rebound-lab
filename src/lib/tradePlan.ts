// 매매 계획 (서버·클라이언트 공용 순수 함수)
//  - 단기(1~4주): 지지·저항선과 매물대로 1차·2차 목표가와 손절선, 손익비,
//    과거 과매도 사례에서 실제로 목표에 도달한 비율
//  - 장기(3~12개월): 적정가에 안전마진을 적용한 매수 구간
// 목표가(단기 매도 기준)와 매수가(장기 적정가 기준)는 서로 다른 개념이다.
import type { Resilience } from "./resilience";
import { hitStats } from "./resilience";
import type { Bar, Snapshot, Tone } from "./types";

export interface Level {
  price: number;
  label: string;
}

export interface Target {
  price: number;
  pct: number; // 현재가 대비 %
  basis: string; // 근거 (예: 50일 이동평균선)
  hitRate: number | null; // 과거 과매도 뒤 20거래일 안에 도달한 비율
  firstRate: number | null; // 손절보다 먼저 도달한 비율
  medianDays: number | null;
}

export type ZoneKey = "aggressive" | "split" | "watch" | "over";

export interface BuyZones {
  margin: number; // 안전마진 (0.15~0.40)
  marginWhy: string[];
  fair: number;
  bear: number | null; // 보수적 적정가
  buyPrice: number; // 기준 적정가 × (1 − 안전마진)
  // 구간 경계
  aggressiveMax: number; // 이 가격 이하: 적극 매수 검토
  splitMax: number; // ~ 이 가격: 분할 매수
  watchMax: number; // ~ 적정가: 관찰, 그 위는 고평가
}

export interface TradePlan {
  price: number; // 계획을 세운 시점의 가격
  atr: number | null;
  t1: Target | null;
  t2: Target | null;
  stop: { price: number; pct: number; basis: string } | null;
  rr: number | null; // 손익비 (1차 목표 기준)
  supports: Level[];
  resistances: Level[];
  volumeNodes: Level[]; // 매물대 (거래가 많이 몰린 가격대)
  zones: BuyZones | null;
  historyN: number; // 확률 계산에 쓴 과거 사례 수
  notes: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const d2 = (v: number) => `$${v.toFixed(2)}`;

/** 매물대: 최근 1년 가격대별 거래량. 평균보다 거래가 많이 몰린 가격대만 */
function volumeProfile(bars: Bar[], bins = 30): Level[] {
  const recent = bars.slice(-252);
  if (recent.length < 60) return [];
  const lo = Math.min(...recent.map((b) => b.low));
  const hi = Math.max(...recent.map((b) => b.high));
  if (!(hi > lo)) return [];
  const step = (hi - lo) / bins;
  const vol = new Array(bins).fill(0);
  for (const b of recent) {
    const tp = (b.high + b.low + b.close) / 3;
    vol[clamp(Math.floor((tp - lo) / step), 0, bins - 1)] += b.volume;
  }
  const avg = vol.reduce((a, v) => a + v, 0) / bins;
  const out: Level[] = [];
  for (let i = 0; i < bins; i++) {
    const isPeak = vol[i] >= avg * 1.3 && (i === 0 || vol[i] >= vol[i - 1]) && (i === bins - 1 || vol[i] >= vol[i + 1]);
    if (isPeak) out.push({ price: lo + step * (i + 0.5), label: `매물대 (거래량 평균의 ${(vol[i] / avg).toFixed(1)}배)` });
  }
  return out;
}

function safetyMargin(input: { confidence: "high" | "mid" | "low"; beta: number | null; marketCap: number | null; fcfNegative: boolean }) {
  let m = 0.2;
  const why: string[] = ["기본 20%"];
  if (input.confidence === "low") {
    m += 0.1;
    why.push("적정가 신뢰도 낮음 +10%");
  } else if (input.confidence === "mid") {
    m += 0.05;
    why.push("적정가 신뢰도 보통 +5%");
  } else {
    m -= 0.05;
    why.push("적정가 신뢰도 높음 −5%");
  }
  if (input.beta != null && input.beta > 1.5) {
    m += 0.05;
    why.push(`변동성 큼(베타 ${input.beta.toFixed(1)}) +5%`);
  }
  if (input.marketCap != null && input.marketCap < 2e9) {
    m += 0.05;
    why.push("소형주(시총 20억 달러 미만) +5%");
  }
  if (input.fcfNegative) {
    m += 0.05;
    why.push("현금흐름 적자 +5%");
  }
  return { margin: clamp(m, 0.15, 0.4), why };
}

export function buildTradePlan(input: {
  bars: Bar[];
  snap: Snapshot;
  res: Resilience;
  fairValue: number | null;
  bearValue: number | null;
  confidence: "high" | "mid" | "low";
  beta: number | null;
  marketCap: number | null;
  fcfNegative: boolean;
}): TradePlan {
  const { bars, snap, res } = input;
  const p = snap.price;
  const atr = snap.atr ?? null;
  const notes: string[] = [];

  // ── 지지·저항 후보 ──
  const nodes = volumeProfile(bars);
  const last63 = bars.slice(-63);
  const preHigh = last63.length ? Math.max(...last63.map((b) => b.close)) : null;
  const levels: Level[] = [
    ...(snap.sma20 ? [{ price: snap.sma20, label: "20일 이동평균선" }] : []),
    ...(snap.sma50 ? [{ price: snap.sma50, label: "50일 이동평균선" }] : []),
    ...(snap.sma200 ? [{ price: snap.sma200, label: "200일 이동평균선" }] : []),
    ...(preHigh ? [{ price: preHigh, label: "최근 3개월 최고 종가 (하락 전 고점)" }] : []),
    ...(snap.low3m ? [{ price: snap.low3m, label: "최근 3개월 저점" }] : []),
    ...(snap.low52 ? [{ price: snap.low52, label: "52주 저점" }] : []),
    ...nodes,
  ];
  const resistances = levels.filter((l) => l.price > p * 1.01).sort((a, b) => a.price - b.price);
  const supports = levels.filter((l) => l.price < p * 0.995).sort((a, b) => b.price - a.price);

  // ── 손절선: 가장 가까운 의미 있는 지지선 아래 (현재가 대비 −5% ~ −20%) ──
  let stop: TradePlan["stop"] = null;
  const sup = supports.find((l) => l.price <= p * 0.97) ?? supports[0];
  if (sup) {
    const raw = sup.price - (atr ? atr * 0.5 : sup.price * 0.02);
    const price = clamp(raw, p * 0.8, p * 0.95);
    stop = { price, pct: ((price - p) / p) * 100, basis: `${sup.label}(${d2(sup.price)}) 아래${atr ? " − ATR 절반" : ""}${price !== raw ? " (−5~−20% 범위로 조정)" : ""}` };
  } else if (atr) {
    const price = clamp(p - 2 * atr, p * 0.8, p * 0.95);
    stop = { price, pct: ((price - p) / p) * 100, basis: "뚜렷한 지지선이 없어 현재가 − ATR 2배" };
  }
  const stopPct = stop ? -stop.pct : 10;

  // ── 목표가 ──
  const mkTarget = (price: number, basis: string): Target => {
    const pct = ((price - p) / p) * 100;
    const h = hitStats(res, pct, stopPct);
    return { price, pct, basis, hitRate: h.hitRate, firstRate: h.firstRate, medianDays: h.medianDays };
  };
  let t1: Target | null = null;
  let t2: Target | null = null;
  const r1 = resistances.find((l) => l.price >= p * 1.03);
  // 가장 가까운 저항선이 25% 넘게 멀면 1~4주 목표로는 비현실적 → 변동폭(ATR 2배)을 1차 목표로
  if (r1 && (r1.price <= p * 1.25 || !atr)) t1 = mkTarget(r1.price, r1.label);
  else if (atr)
    t1 = mkTarget(Math.min(p + 2 * atr, p * 1.25), r1 ? `가까운 저항선(${r1.label})이 멀어 현재가 + ATR 2배` : "위쪽 저항선이 없어 현재가 + ATR 2배");
  if (t1) {
    const r2 = resistances.find((l) => l.price >= t1!.price * 1.03);
    let price = r2?.price ?? null;
    let basis = r2?.label ?? "";
    if (input.fairValue && (price == null || price > input.fairValue) && input.fairValue > t1.price * 1.03) {
      price = Math.min(price ?? Infinity, input.fairValue);
      basis = price === input.fairValue ? "기준 적정가 (장기 목표와 같음)" : basis;
    }
    if (price != null) t2 = mkTarget(price, basis);
  }
  const rr = t1 && stop ? (t1.price - p) / (p - stop.price) : null;
  if (rr != null && rr < 1.5) notes.push(`손익비 ${rr.toFixed(1)} — 1.5 미만이라 단기 매매엔 불리합니다. 더 내려오거나 저항선이 뚫릴 때까지 기다리는 편이 낫습니다.`);
  const hist = hitStats(res, 0, stopPct);
  if (hist.n < 3) notes.push("과거 과매도 사례가 3회 미만이라 목표가 도달 확률은 계산하지 않았습니다.");

  // ── 장기 매수 구간 ──
  let zones: BuyZones | null = null;
  if (input.fairValue && input.fairValue > 0) {
    const sm = safetyMargin(input);
    const F = input.fairValue;
    const buyPrice = F * (1 - sm.margin);
    zones = {
      margin: sm.margin,
      marginWhy: sm.why,
      fair: F,
      bear: input.bearValue,
      buyPrice,
      aggressiveMax: buyPrice,
      splitMax: F * (1 - sm.margin / 2),
      watchMax: F,
    };
  }

  return {
    price: p,
    atr,
    t1,
    t2,
    stop,
    rr,
    supports: supports.slice(0, 4),
    resistances: resistances.slice(0, 4),
    volumeNodes: nodes,
    zones,
    historyN: hist.n,
    notes,
  };
}

export const ZONE_INFO: Record<ZoneKey, { label: string; action: string; tone: Tone }> = {
  aggressive: { label: "적극 매수 검토 구간", action: "안전마진을 충분히 확보한 가격입니다. 손절선을 정하고 매수를 검토하세요.", tone: "good" },
  split: { label: "분할 매수 구간", action: "할인은 됐지만 안전마진이 충분하지 않습니다. 2~3번에 나눠 사세요.", tone: "good" },
  watch: { label: "관찰 구간", action: "적정가보다 싸지만 할인 폭이 작습니다. 분할 매수 구간까지 내려오길 기다리세요.", tone: "warn" },
  over: { label: "고평가 구간", action: "적정가보다 비쌉니다. 새로 사지 않습니다.", tone: "bad" },
};

/** 현재가가 어느 매수 구간에 있는지 (실시간 가격으로 화면에서 바로 계산) */
export function zoneOf(z: Pick<BuyZones, "aggressiveMax" | "splitMax" | "watchMax"> | null, price: number): ZoneKey | null {
  if (!z) return null;
  if (price <= z.aggressiveMax) return "aggressive";
  if (price <= z.splitMax) return "split";
  if (price <= z.watchMax) return "watch";
  return "over";
}

/** 초보자용 한 줄 행동 지침 */
export function actionOf(input: { blocked: string | null; zone: ZoneKey | null; price: number; stop: number | null; rr: number | null; shortScore?: number | null }): {
  title: string;
  tone: Tone;
  text: string;
} {
  if (input.blocked) return { title: "사지 않음", tone: "bad", text: `${input.blocked} — RSI가 아무리 낮아도 피합니다.` };
  if (input.stop != null && input.price <= input.stop)
    return { title: "손절선 이탈", tone: "bad", text: "손절 기준 아래로 내려왔습니다. 보유 중이면 계획대로 정리하고, 새로 사지 않습니다." };
  if (!input.zone) return { title: "관찰", tone: "neutral", text: "적정가를 계산할 수 없어 매수 구간을 정하지 않았습니다. 직접 확인이 필요합니다." };
  const z = ZONE_INFO[input.zone];
  if ((input.zone === "aggressive" || input.zone === "split") && input.rr != null && input.rr < 1)
    return { title: "관찰", tone: "warn", text: `${z.label}이지만 손익비가 ${input.rr.toFixed(1)}로 낮습니다. 반등 공간보다 손절 폭이 커서 기다립니다.` };
  if (input.zone === "aggressive" && input.shortScore != null && input.shortScore < 50)
    return { title: "분할 매수", tone: "good", text: "장기 적정가 기준으로는 충분히 싼 가격이지만 단기 반등 신호가 약합니다. 바닥을 확인하기 어려우니 한 번에 사지 말고 2~3번에 나눠 사세요." };
  const title = { aggressive: "적극 매수 검토", split: "분할 매수", watch: "관찰", over: "매수 보류" }[input.zone];
  return { title, tone: z.tone, text: z.action };
}
