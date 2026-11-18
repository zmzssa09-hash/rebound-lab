// 서버 전용: 가상 포트폴리오 (모의투자)
// 가상의 $10,000로 이 사이트가 초보자에게 안내하는 규칙을 그대로 자동 매매한다.
//  매수: 추천 Top 10 중 '지금 해야 할 일'이 적극 매수 검토·분할 매수인 종목
//        → 몇 주 살지 계산기 수량의 절반(1차)을 사고, 다음 분석 이후 산 가격 이상을 지키면 나머지(2차)
//  매도: 손절가 도달 → 전량 / 1차 목표 도달 → 절반 + 손절가를 산 가격으로 / 2차 목표 도달 → 전량
//        추천에서 나쁜 이유로 빠지면(회피·점수 하락·장기 보유 부적합·적정가 도달) → 전량
//        60일 넘게 보유 → 전량
//  제한: 한 종목 20%, 손절 시 손실 1%, 동시에 5종목, 같은 업종 2종목, 약세장이면 수량 절반
//  수수료 0.25%(매수·매도 각각)를 반영한다. 세금·환율은 반영하지 않는다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeSnapshot } from "./analysis";
import { sizePosition } from "./sizing";
import { actionOf, zoneOf } from "./tradePlan";
import type { Pick, PickExit } from "./types";
import { fetchChart } from "./yahoo";

const FILE = path.join(process.cwd(), ".data", "paper.json");
export const PAPER_START_CASH = 10_000;
export const FEE_RATE = 0.0025;
const RISK_PCT = 1;
const MAX_WEIGHT = 20;
const MAX_POSITIONS = 5;
const MAX_PER_SECTOR = 2;
const MAX_HOLD_DAYS = 60;
const COOLDOWN_DAYS = 5; // 판 종목은 5일간 다시 사지 않음
const DAY = 86_400_000;

export interface PaperPosition {
  symbol: string;
  name: string;
  sector: string | null;
  shares: number;
  avgCost: number;
  openedAt: number;
  stop: number;
  t1: number | null;
  t2: number | null;
  tranche: 1 | 2; // 2차 매수까지 했는지
  plannedShares: number; // 계산기가 정한 전체 수량
  halfSold: boolean;
  lastPrice: number;
}

export interface PaperTrade {
  at: number;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  fee: number;
  reason: string;
  pnl: number | null; // 매도 시 실현손익 (수수료 포함)
}

export interface PaperPoint {
  day: string; // YYYY-MM-DD (한국 날짜)
  equity: number;
  spy: number;
}

export interface PaperFile {
  startedAt: number;
  updatedAt: number;
  cash: number;
  spyStart: number | null;
  positions: PaperPosition[];
  trades: PaperTrade[];
  history: PaperPoint[];
  cooldown: Record<string, number>;
}

export async function loadPaper(): Promise<PaperFile | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as PaperFile;
  } catch {
    return null;
  }
}

const dayKST = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

const BAD_EXIT = /회피|점수 하락|장기 보유|적정가|조건 탈락|데이터/;

/** 분석이 끝날 때마다 호출 */
export async function updatePaper(top: Pick[], exits: PickExit[], now = Date.now()): Promise<{ file: PaperFile; newTrades: PaperTrade[] }> {
  const spyChart = await fetchChart("SPY", "2y").catch(() => null);
  const spy = spyChart?.meta.price ?? null;
  const bear = spyChart ? (() => {
    const s = computeSnapshot(spyChart.bars, spyChart.meta.price);
    return s.sma200 != null && s.price < s.sma200;
  })() : false;

  const p: PaperFile = (await loadPaper()) ?? {
    startedAt: now,
    updatedAt: now,
    cash: PAPER_START_CASH,
    spyStart: spy,
    positions: [],
    trades: [],
    history: [],
    cooldown: {},
  };
  const newTrades: PaperTrade[] = [];
  const bySym = new Map(top.map((x) => [x.symbol, x]));
  const exitBy = new Map(exits.map((e) => [e.symbol, e])); // 이번 분석에서 새로 빠진 종목만 넘어온다

  const priceOf = async (sym: string): Promise<number | null> => {
    const t = bySym.get(sym);
    if (t) return t.live?.price ?? t.price;
    try {
      return (await fetchChart(sym, "2y")).meta.price;
    } catch {
      return null;
    }
  };

  const sell = (pos: PaperPosition, shares: number, price: number, reason: string) => {
    shares = Math.min(shares, pos.shares);
    if (shares <= 0) return;
    const gross = shares * price;
    const fee = gross * FEE_RATE;
    const pnl = (price - pos.avgCost) * shares - fee;
    p.cash += gross - fee;
    pos.shares -= shares;
    const tr: PaperTrade = { at: now, symbol: pos.symbol, name: pos.name, side: "sell", shares, price, fee, reason, pnl };
    p.trades.unshift(tr);
    newTrades.push(tr);
  };
  const buy = (sym: string, name: string, shares: number, price: number, reason: string) => {
    const gross = shares * price;
    const fee = gross * FEE_RATE;
    p.cash -= gross + fee;
    const tr: PaperTrade = { at: now, symbol: sym, name, side: "buy", shares, price, fee, reason, pnl: null };
    p.trades.unshift(tr);
    newTrades.push(tr);
  };

  // 1) 보유 종목 관리 (매도)
  for (const pos of p.positions) {
    const price = await priceOf(pos.symbol);
    if (price == null) continue;
    pos.lastPrice = price;
    const pick = bySym.get(pos.symbol);
    const ex = exitBy.get(pos.symbol);
    if (price <= pos.stop) {
      sell(pos, pos.shares, price, pos.halfSold ? "본전 손절선 도달 (1차 목표 후 올려둔 손절가)" : "손절가 도달");
    } else if (pos.t2 && price >= pos.t2) {
      sell(pos, pos.shares, price, "2차 목표 도달 — 전량 이익 실현");
    } else if (!pos.halfSold && pos.t1 && price >= pos.t1) {
      sell(pos, Math.floor(pos.shares / 2) || pos.shares, price, "1차 목표 도달 — 절반 이익 실현, 손절가를 산 가격으로 올림");
      pos.halfSold = true;
      pos.stop = Math.max(pos.stop, pos.avgCost);
    } else if (ex && BAD_EXIT.test(ex.reason)) {
      sell(pos, pos.shares, price, `추천 종료 — ${ex.reason}`);
    } else if (now - pos.openedAt > MAX_HOLD_DAYS * DAY) {
      sell(pos, pos.shares, price, `${MAX_HOLD_DAYS}일 보유 기간 초과`);
    } else if (pick?.plan) {
      // 최신 분석의 목표가를 따라감 (손절가는 올리기만)
      pos.t1 = pos.halfSold ? pos.t1 : (pick.plan.t1?.price ?? pos.t1);
      pos.t2 = pick.plan.t2?.price ?? pos.t2;
    }
    if (pos.shares <= 0) p.cooldown[pos.symbol] = now;
  }
  p.positions = p.positions.filter((x) => x.shares > 0);

  // 2) 2차 매수: 1차 매수 다음 분석 이후, 산 가격 이상을 지키고 아직 1차 목표 전
  const equityNow = () => p.cash + p.positions.reduce((a, x) => a + x.shares * x.lastPrice, 0);
  for (const pos of p.positions) {
    if (pos.tranche !== 1 || pos.halfSold || now - pos.openedAt < 12 * 3600_000) continue;
    if (pos.lastPrice < pos.avgCost || (pos.t1 && pos.lastPrice >= pos.t1)) continue;
    const add = pos.plannedShares - pos.shares;
    if (add <= 0) {
      pos.tranche = 2;
      continue;
    }
    const n = Math.min(add, Math.floor(p.cash / (pos.lastPrice * (1 + FEE_RATE))));
    if (n <= 0) continue;
    buy(pos.symbol, pos.name, n, pos.lastPrice, "2차 매수 — 산 가격을 지켜 반등 확인");
    pos.avgCost = (pos.avgCost * pos.shares + pos.lastPrice * n) / (pos.shares + n);
    pos.shares += n;
    pos.tranche = 2;
  }

  // 3) 신규 매수
  const sectorCount = (sec: string | null) => p.positions.filter((x) => x.sector && x.sector === sec).length;
  const candidates = [...top].sort((a, b) => (b.rankScore ?? b.total) - (a.rankScore ?? a.total));
  for (const pick of candidates) {
    if (p.positions.length >= MAX_POSITIONS) break;
    if (p.positions.some((x) => x.symbol === pick.symbol)) continue;
    if (p.cooldown[pick.symbol] && now - p.cooldown[pick.symbol] < COOLDOWN_DAYS * DAY) continue;
    if (pick.sectorKo && sectorCount(pick.sectorKo) >= MAX_PER_SECTOR) continue;
    const plan = pick.plan;
    if (!plan?.stop) continue;
    const price = pick.live?.price ?? pick.price;
    const zone = zoneOf(plan.zones, price);
    const act = actionOf({
      blocked: pick.blocked ?? null,
      zone,
      price,
      stop: plan.stop.price,
      rr: plan.rr,
      shortScore: pick.shortGrade?.score ?? null,
      earningsAt: pick.earningsDate ?? null,
    });
    if (act.title !== "적극 매수 검토" && act.title !== "분할 매수") continue;
    const size = sizePosition({ account: equityNow(), riskPct: RISK_PCT, maxWeight: MAX_WEIGHT, price, stop: plan.stop.price, bear });
    if (!size || size.shares <= 0) continue;
    const n = Math.min(size.firstBuy, Math.floor(p.cash / (price * (1 + FEE_RATE))));
    if (n <= 0) continue;
    buy(pick.symbol, pick.nameKo ?? pick.name, n, price, `${act.title} — 1차 매수 (계획 ${size.shares}주 중 ${n}주)${bear ? " · 약세장 절반" : ""}`);
    p.positions.push({
      symbol: pick.symbol,
      name: pick.nameKo ?? pick.name,
      sector: pick.sectorKo,
      shares: n,
      avgCost: price,
      openedAt: now,
      stop: plan.stop.price,
      t1: plan.t1?.price ?? null,
      t2: plan.t2?.price ?? null,
      tranche: n >= size.shares ? 2 : 1,
      plannedShares: size.shares,
      halfSold: false,
      lastPrice: price,
    });
  }

  // 4) 기록
  for (const k of Object.keys(p.cooldown)) if (now - p.cooldown[k] > COOLDOWN_DAYS * DAY) delete p.cooldown[k];
  const equity = equityNow();
  const day = dayKST(now);
  if (spy) {
    const last = p.history[p.history.length - 1];
    if (last && last.day === day) Object.assign(last, { equity, spy });
    else p.history.push({ day, equity, spy });
  }
  p.trades = p.trades.slice(0, 500);
  p.updatedAt = now;
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(p));
  return { file: p, newTrades };
}

// ───────── 읽기 (배포 서버는 GitHub data 브랜치에서) ─────────
const BASE = process.env.DATA_BASE_URL?.replace(/\/$/, "");
const PC = globalThis as unknown as { __paper?: { at: number; data: PaperFile | null } };

export async function getPaper(): Promise<PaperFile | null> {
  if (!BASE) return loadPaper();
  const c = PC.__paper;
  if (c && Date.now() - c.at < 2 * 60_000) return c.data;
  try {
    const res = await fetch(`${BASE}/paper.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as PaperFile;
    PC.__paper = { at: Date.now(), data };
    return data;
  } catch {
    return c?.data ?? null;
  }
}

/** 화면용 요약 */
export function paperSummary(p: PaperFile) {
  const invested = p.positions.reduce((a, x) => a + x.shares * x.lastPrice, 0);
  const equity = p.cash + invested;
  const sells = p.trades.filter((t) => t.side === "sell" && t.pnl != null);
  const wins = sells.filter((t) => (t.pnl ?? 0) > 0);
  const lastSpy = p.history[p.history.length - 1]?.spy ?? null;
  // 고점 대비 최대 하락
  let peak = PAPER_START_CASH;
  let mdd = 0;
  for (const h of p.history) {
    peak = Math.max(peak, h.equity);
    mdd = Math.min(mdd, (h.equity - peak) / peak);
  }
  return {
    equity,
    cash: p.cash,
    invested,
    ret: (equity / PAPER_START_CASH - 1) * 100,
    spyRet: p.spyStart && lastSpy ? (lastSpy / p.spyStart - 1) * 100 : null,
    realized: sells.reduce((a, t) => a + (t.pnl ?? 0), 0),
    sells: sells.length,
    winRate: sells.length ? wins.length / sells.length : null,
    fees: p.trades.reduce((a, t) => a + t.fee, 0),
    mdd: mdd * 100,
  };
}
