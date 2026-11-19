// 과거 검증(백테스트) — 순수 계산 모듈
// 사이트의 실제 매매 계획 코드(목표가·손절가 계산)를 과거 10년 일봉에 그대로 적용한다.
//  신호: RSI(14)가 30 이하로 새로 들어온 날 (RSI 40 위로 회복해야 다음 신호 인정)
//        + 주가 $5 이상, 20일 평균 거래대금 200만 달러 이상, 손익비 1 이상 (사이트의 '관찰' 조건 제외)
//  매수: 신호 다음 날 시가 (시가가 이미 손절가 아래면 매수하지 않음)
//  매도: 손절가 → 전량 / 1차 목표 → 절반 + 손절가를 산 가격으로 / 2차 목표 → 나머지 / 60거래일 → 종가에 전량
//        같은 날 손절과 목표가 모두 닿으면 손절이 먼저라고 가정(보수적)
//  수수료: 사고팔 때 0.25%씩
// 한계: 과거 재무제표가 없어 적정가·회피 신호·장기 보유 기준(펀더멘털 필터)은 검증하지 못한다.
//       지금 상장된 종목만 대상이라 상장폐지된 종목이 빠진다(생존 편향 → 결과가 실제보다 좋게 나오기 쉬움).
import { computeSnapshot } from "./analysis";
import { rsi, sma } from "./indicators";
import { analyzeResilience } from "./resilience";
import { technicalScore } from "./scorecard";
import { buildTradePlan } from "./tradePlan";
import type { Bar } from "./types";

export const BT_FEE = 0.0025;

export interface BtLeg {
  t: number; // 체결일 (UNIX초)
  frac: number; // 처음 수량 대비 비율
  price: number;
  why: "stop" | "breakeven" | "t1" | "t2" | "time";
}

export interface BtTrade {
  symbol: string;
  signalT: number;
  entryT: number;
  entry: number;
  stop: number;
  t1: number;
  t2: number | null;
  rr: number;
  rsi: number;
  tech: number; // 기술적 분석 점수 (0~15)
  bear: boolean; // 신호 당시 S&P 500이 200일선 아래
  legs: BtLeg[];
  ret: number; // 수수료 포함 수익률 %
  hold20: number | null; // 비교용: 20거래일 그냥 보유 %
  spyRet: number | null; // 같은 보유 기간 S&P 500 %
  days: number; // 보유 거래일
}

/** SPY: 날짜별 종가 + 200일선 위 여부 */
export function spyIndex(bars: Bar[]) {
  const closes = bars.map((b) => b.close);
  const s200 = sma(closes, 200);
  const byT = new Map<number, { close: number; above200: boolean | null }>();
  const dayKey = (t: number) => Math.floor(t / 86400);
  bars.forEach((b, i) => byT.set(dayKey(b.time), { close: b.close, above200: s200[i] != null ? b.close > s200[i]! : null }));
  return {
    get: (t: number) => byT.get(dayKey(t)) ?? null,
    days: bars.map((b) => b.time),
  };
}

export interface SimOptions {
  /** site: 사이트 손절선 / wide: 현재가 − ATR 2.5배(−10~−20%) / none: 손절 없음 */
  stop: "site" | "wide" | "none";
  maxHold: number; // 최대 보유 거래일
}

export const SITE_RULES: SimOptions = { stop: "site", maxHold: 60 };

/** 한 종목의 모든 과거 매매 */
export function simulateSymbol(symbol: string, bars: Bar[], spy: ReturnType<typeof spyIndex>, opts: SimOptions = SITE_RULES): BtTrade[] {
  const out: BtTrade[] = [];
  if (bars.length < 300) return out;
  const closes = bars.map((b) => b.close);
  const r = rsi(closes, 14);
  const dv = sma(bars.map((b) => b.close * b.volume), 20);
  let armed = true;
  for (let i = 250; i < bars.length - 2; i++) {
    const v = r[i];
    if (v == null) continue;
    if (v > 40) armed = true;
    if (!armed || v > 30) continue;
    armed = false;
    if (closes[i] < 5 || (dv[i] ?? 0) < 2_000_000) continue;

    // 그날까지의 데이터만으로 사이트와 똑같이 매매 계획 계산
    const hist = bars.slice(0, i + 1);
    const snap = computeSnapshot(hist);
    const res = analyzeResilience(hist);
    const plan = buildTradePlan({ bars: hist, snap, res, fairValue: null, bearValue: null, confidence: "mid", beta: null, marketCap: null, fcfNegative: false });
    if (!plan.t1 || !plan.stop || plan.rr == null || plan.rr < 1) continue;
    const supports = [...plan.supports.map((l) => l.price), ...plan.volumeNodes.map((l) => l.price)];

    const e = bars[i + 1];
    const entry = e.open;
    const p0 = snap.price;
    const wide = snap.atr ? Math.min(Math.max(p0 - 2.5 * snap.atr, p0 * 0.8), p0 * 0.9) : p0 * 0.85;
    let stop = opts.stop === "site" ? plan.stop.price : opts.stop === "wide" ? Math.min(wide, plan.stop.price) : 0;
    if (entry <= stop) continue;
    const stop0 = stop > 0 ? stop : Math.min(wide, plan.stop.price); // 수량 계산용 (손절 없음 규칙은 넓은 손절선 기준)
    const t1 = plan.t1.price;
    const t2 = plan.t2?.price ?? null;
    const legs: BtLeg[] = [];
    let left = 1;
    let half = false;
    let lastJ = i + 1;
    for (let j = i + 1; j < Math.min(bars.length, i + 1 + opts.maxHold) && left > 0; j++) {
      const b = bars[j];
      lastJ = j;
      if (b.low <= stop) {
        const px = j > i + 1 && b.open < stop ? b.open : stop; // 갭 하락이면 시가에 체결
        legs.push({ t: b.time, frac: left, price: px, why: half ? "breakeven" : "stop" });
        left = 0;
        break;
      }
      if (!half && b.high >= t1) {
        const f = left / 2;
        legs.push({ t: b.time, frac: f, price: Math.max(t1, b.open), why: "t1" });
        left -= f;
        half = true;
        stop = Math.max(stop, entry);
      }
      if (t2 && b.high >= t2 && left > 0) {
        legs.push({ t: b.time, frac: left, price: Math.max(t2, b.open), why: "t2" });
        left = 0;
      }
    }
    if (left > 0) {
      const b = bars[lastJ];
      legs.push({ t: b.time, frac: left, price: b.close, why: "time" });
    }
    const gross = legs.reduce((a, l) => a + l.frac * (l.price / entry - 1), 0);
    const ret = (gross - BT_FEE * 2) * 100;
    const exitT = legs[legs.length - 1].t;
    const s0 = spy.get(e.time);
    const s1 = spy.get(exitT);
    const sig = spy.get(bars[i].time);
    out.push({
      symbol,
      signalT: bars[i].time,
      entryT: e.time,
      entry,
      stop: stop0,
      t1,
      t2,
      rr: plan.rr,
      rsi: v,
      tech: technicalScore(snap, supports).score,
      bear: sig?.above200 === false,
      legs,
      ret,
      hold20: i + 21 < bars.length ? (bars[i + 21].close / entry - 1 - BT_FEE * 2) * 100 : null,
      spyRet: s0 && s1 ? (s1.close / s0.close - 1) * 100 : null,
      days: lastJ - i,
    });
  }
  return out;
}

// ───────── 통계 ─────────

export interface BtStats {
  n: number;
  winRate: number | null;
  avg: number | null; // 거래당 평균 %
  median: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null; // 총이익 ÷ 총손실
  spyAvg: number | null; // 같은 기간 S&P 500 평균 %
  avgDays: number | null;
  stopRate: number | null; // 처음 손절가에 걸린 비율
  t1Rate: number | null; // 1차 목표 도달 비율
}

const med = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function tradeStats(ts: BtTrade[], pick: (t: BtTrade) => number | null = (t) => t.ret): BtStats {
  const rs = ts.map(pick).filter((x): x is number => x != null);
  const wins = rs.filter((x) => x > 0);
  const losses = rs.filter((x) => x <= 0);
  const sumW = wins.reduce((a, b) => a + b, 0);
  const sumL = -losses.reduce((a, b) => a + b, 0);
  return {
    n: rs.length,
    winRate: rs.length ? wins.length / rs.length : null,
    avg: avg(rs),
    median: med(rs),
    avgWin: avg(wins),
    avgLoss: avg(losses),
    profitFactor: sumL > 0 ? sumW / sumL : null,
    spyAvg: avg(ts.map((t) => t.spyRet).filter((x): x is number => x != null)),
    avgDays: avg(ts.map((t) => t.days)),
    stopRate: ts.length ? ts.filter((t) => t.legs[0]?.why === "stop").length / ts.length : null,
    t1Rate: ts.length ? ts.filter((t) => t.legs.some((l) => l.why === "t1")).length / ts.length : null,
  };
}

// ───────── 포트폴리오 시뮬레이션 ($10,000, 최대 5종목, 1% 위험, 종목당 20%) ─────────

export interface BtPortfolio {
  start: number;
  end: number;
  cagr: number | null; // 연평균 %
  totalRet: number; // %
  mdd: number; // 최대 하락 %
  spyTotal: number | null;
  spyCagr: number | null;
  spyMdd: number | null;
  trades: number;
  avgInvested: number; // 평균 투자 비중 % (종목에 들어간 돈)
  curve: { t: number; equity: number; spy: number }[]; // 주 단위
}

/** 남는 현금 → SPY 규칙: 현금은 자산의 20%만 남기고, 30%를 넘으면 넘친 만큼 SPY 매수 */
export const PARK_CASH = 0.2;
export const PARK_BAND = 0.1;

export function simulatePortfolio(
  trades: BtTrade[],
  closeOf: (symbol: string, t: number) => number | null,
  spyBars: Bar[],
  opts: { skipBear: boolean; startCash?: number; maxPos?: number; parkSpy?: boolean; parkFee?: number },
): BtPortfolio {
  const startCash = opts.startCash ?? 10_000;
  const maxPos = opts.maxPos ?? 5;
  const day = (t: number) => Math.floor(t / 86400);
  const byEntry = new Map<number, BtTrade[]>();
  for (const t of trades) {
    if (opts.skipBear && t.bear) continue;
    const k = day(t.entryT);
    byEntry.set(k, [...(byEntry.get(k) ?? []), t]);
  }
  const first = Math.min(...trades.map((t) => t.entryT));
  const days = spyBars.filter((b) => b.time >= first);
  let cash = startCash;
  interface Open {
    t: BtTrade;
    shares: number;
    legs: BtLeg[];
    last: number;
  }
  const open: Open[] = [];
  let count = 0;
  let peak = startCash;
  let mdd = 0;
  const curve: BtPortfolio["curve"] = [];
  const spy0 = days[0]?.close ?? 1;
  let spyPeak = spy0;
  let spyMdd = 0;
  let invSum = 0;
  // parkSpy: 쓰지 않는 현금은 S&P 500 ETF(SPY)에 넣어 둔다 (현실적인 규칙)
  //  · 현금은 자산의 PARK_CASH(20% = 한 종목 몫)만 남기고, 그보다 PARK_BAND(10%) 넘게 많아지면 넘친 만큼 SPY를 산다
  //  · 종목을 사려는데 현금이 모자라면 그만큼만 SPY를 판다 (SPY 매매에도 수수료)
  const park = opts.parkSpy === true;
  const pFee = opts.parkFee ?? BT_FEE;
  let spyVal = 0;
  for (let k = 0; k < days.length; k++) {
    const d = days[k];
    const dk = day(d.time);
    if (park && k > 0) spyVal *= d.close / days[k - 1].close;
    // 평가
    const mark = () =>
      cash +
      spyVal +
      open.reduce((a, o) => {
        const left = o.legs.reduce((s, l) => s + l.frac, 0);
        const px = closeOf(o.t.symbol, d.time) ?? o.last;
        o.last = px;
        return a + o.shares * left * px;
      }, 0);
    // 매수 (RSI가 낮은 순)
    const cands = (byEntry.get(dk) ?? []).sort((a, b) => a.rsi - b.rsi);
    for (const t of cands) {
      if (open.length >= maxPos) break;
      if (open.some((o) => o.t.symbol === t.symbol)) continue;
      const eq = mark();
      const byRisk = (eq * 0.01) / (t.entry - t.stop);
      const byCap = (eq * 0.2) / t.entry;
      const avail = cash + spyVal * (1 - pFee);
      const shares = Math.min(byRisk, byCap, avail / (t.entry * (1 + BT_FEE)));
      if (shares * t.entry < 50) continue;
      const cost = shares * t.entry * (1 + BT_FEE);
      if (cost > cash) {
        const sell = Math.min(spyVal, (cost - cash) / (1 - pFee));
        spyVal -= sell;
        cash += sell * (1 - pFee);
      }
      cash = Math.max(0, cash - cost);
      open.push({ t, shares, legs: [...t.legs], last: t.entry });
      count++;
    }
    // 매도 (시가 매수 뒤 장중·종가 체결 — 산 날 바로 손절되는 경우 포함)
    for (const o of open) {
      for (const l of o.legs.filter((x) => day(x.t) <= dk)) cash += o.shares * l.frac * l.price * (1 - BT_FEE);
      o.legs = o.legs.filter((x) => day(x.t) > dk);
    }
    for (let x = open.length - 1; x >= 0; x--) if (!open[x].legs.length) open.splice(x, 1);
    if (park) {
      const e0 = mark();
      if (cash > e0 * (PARK_CASH + PARK_BAND)) {
        const buy = cash - e0 * PARK_CASH;
        cash -= buy;
        spyVal += buy * (1 - pFee);
      }
    }
    const eq = mark();
    invSum += eq > 0 ? (eq - cash - spyVal) / eq : 0;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
    spyPeak = Math.max(spyPeak, d.close);
    spyMdd = Math.min(spyMdd, d.close / spyPeak - 1);
    if (k % 5 === 0 || k === days.length - 1) curve.push({ t: d.time, equity: Math.round(eq), spy: Math.round((d.close / spy0) * startCash) });
  }
  const end = curve[curve.length - 1]?.equity ?? startCash;
  const years = days.length / 252;
  const spyEnd = days.length ? days[days.length - 1].close / spy0 : null;
  return {
    start: startCash,
    end,
    totalRet: (end / startCash - 1) * 100,
    cagr: years > 0.5 ? ((end / startCash) ** (1 / years) - 1) * 100 : null,
    mdd: mdd * 100,
    spyTotal: spyEnd != null ? (spyEnd - 1) * 100 : null,
    spyCagr: spyEnd != null && years > 0.5 ? (spyEnd ** (1 / years) - 1) * 100 : null,
    spyMdd: spyMdd * 100,
    trades: count,
    avgInvested: days.length ? (invSum / days.length) * 100 : 0,
    curve,
  };
}
