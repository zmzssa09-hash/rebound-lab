// 서버 전용: Top 10 선정 + 추천 이력
// 원칙: 진짜 추천할 종목은 시간이 지나도 상위권에 남는다.
//  - 이미 Top 10인 종목(기존 추천)은 조건이 유지되는 한 자리를 지킨다 (RSI가 30을 넘어 반등 중이어도 유지)
//  - 새 종목은 기존 종목보다 순위 점수가 3점 이상 높아야 자리를 빼앗는다
//  - 연속 추천될수록 순위 점수에 보너스(최대 +5)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pick, PickExit } from "./types";

const FILE = path.join(process.cwd(), ".data", "history.json");

export const TOP_N = 10;
export const NEW_MIN_SCORE = 65; // 신규 진입 최소 점수
export const KEEP_MIN_SCORE = 55; // 기존 추천 유지 최소 점수
const KEEP_MAX_RSI = 60; // 이 이상이면 반등 완료로 보고 졸업
const SWAP_MARGIN = 3;

interface Entry {
  symbol: string;
  name: string;
  nameKo: string | null;
  firstPickedAt: number;
  firstPrice: number;
  streak: number;
  lastRank: number;
  bestRank: number;
}

export interface History {
  updatedAt: number;
  active: Record<string, Entry>; // 현재 Top 10
  exits: PickExit[]; // 최근 빠진 종목 (최신순)
}

export async function loadHistory(): Promise<History> {
  try {
    const h = JSON.parse(await readFile(FILE, "utf8")) as History;
    return { updatedAt: h.updatedAt ?? 0, active: h.active ?? {}, exits: h.exits ?? [] };
  } catch {
    return { updatedAt: 0, active: {}, exits: [] };
  }
}

async function saveHistory(h: History) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(h));
}

const bonus = (streak: number) => Math.min(streak, 10) * 0.5;

/** 기존 추천 종목이 자리를 유지할 수 있는지 */
function keepReason(p: Pick, firstPrice: number): string | null {
  if (p.excluded) return p.excludeReason ?? "추천 조건 탈락";
  if (p.longTermOk === false) return "장기 보유 기준 미달";
  if (p.rsi != null && p.rsi >= KEEP_MAX_RSI) return `반등 진행 — RSI ${p.rsi.toFixed(0)} 도달`;
  if (p.fairValue && p.price >= p.fairValue * 0.95) {
    // 추천 이후 올라서 적정가에 닿은 경우와, 처음부터 적정가보다 비싼 경우를 구분
    return p.price > firstPrice * 1.03
      ? `적정가($${p.fairValue.toFixed(2)}) 근접 — 반등 목표 달성`
      : `현재가가 적정가($${p.fairValue.toFixed(2)}) 이상 — 할인 매력 없음`;
  }
  if (p.total < KEEP_MIN_SCORE) return `점수 하락 (${p.total}점)`;
  return null;
}

/**
 * @param evaluated 이번에 평가한 종목 (과매도 후보 + 기존 Top 10 재평가)
 */
export async function selectTop(evaluated: Pick[]): Promise<{ top: Pick[]; exits: PickExit[] }> {
  const h = await loadHistory();
  const now = Date.now();
  const bySym = new Map(evaluated.map((p) => [p.symbol, p]));

  // 1) 후보 구성
  const incumbents: Pick[] = [];
  const dropped: { e: Entry; reason: string; price: number | null }[] = [];
  for (const e of Object.values(h.active)) {
    const p = bySym.get(e.symbol);
    if (!p) {
      dropped.push({ e, reason: "시세·재무 데이터를 받지 못함", price: null });
      continue;
    }
    const r = keepReason(p, e.firstPrice);
    if (r) dropped.push({ e, reason: r, price: p.price });
    else incumbents.push({ ...p, streak: e.streak, rankScore: p.total + bonus(e.streak + 1) });
  }
  const incSet = new Set(incumbents.map((p) => p.symbol));
  const newcomers = evaluated
    .filter((p) => !incSet.has(p.symbol) && !h.active[p.symbol] && !p.excluded && p.total >= NEW_MIN_SCORE && p.rsi != null && p.rsi <= 30)
    .map((p) => ({ ...p, streak: 0, rankScore: p.total + bonus(1) }));

  // 2) 기존 추천 우선 배치, 남는 자리는 신규로 채움
  incumbents.sort((a, b) => b.rankScore! - a.rankScore!);
  newcomers.sort((a, b) => b.rankScore! - a.rankScore!);
  let top = incumbents.slice(0, TOP_N);
  const overflow = incumbents.slice(TOP_N);
  const pool = [...newcomers];
  while (top.length < TOP_N && pool.length) top.push(pool.shift()!);

  // 3) 신규가 기존 최하위보다 SWAP_MARGIN 이상 높으면 교체
  for (const n of pool) {
    const weakest = top.reduce((w, p) => (p.rankScore! < w.rankScore! ? p : w), top[0]);
    if (weakest && incSet.has(weakest.symbol) && n.rankScore! >= weakest.rankScore! + SWAP_MARGIN) {
      top = top.filter((p) => p !== weakest);
      top.push(n);
      dropped.push({ e: h.active[weakest.symbol], reason: `더 높은 점수 종목(${n.symbol})에 밀림`, price: weakest.price });
    }
  }
  for (const p of overflow) dropped.push({ e: h.active[p.symbol], reason: "Top 10 자리 부족", price: p.price });

  // 4) 순위 확정 + 이력 갱신
  top.sort((a, b) => b.rankScore! - a.rankScore!);
  const active: Record<string, Entry> = {};
  const ranked = top.map((p, i) => {
    const prev = h.active[p.symbol];
    const rank = i + 1;
    const entry: Entry = prev
      ? { ...prev, name: p.name, nameKo: p.nameKo, streak: prev.streak + 1, lastRank: rank, bestRank: Math.min(prev.bestRank, rank) }
      : { symbol: p.symbol, name: p.name, nameKo: p.nameKo, firstPickedAt: now, firstPrice: p.price, streak: 1, lastRank: rank, bestRank: rank };
    active[p.symbol] = entry;
    return {
      ...p,
      rank,
      prevRank: prev?.lastRank ?? null,
      streak: entry.streak,
      firstPickedAt: entry.firstPickedAt,
      firstPrice: entry.firstPrice,
    };
  });

  const newExits: PickExit[] = dropped
    .filter((d) => d.e)
    .map((d) => ({
      symbol: d.e.symbol,
      name: d.e.name,
      nameKo: d.e.nameKo,
      firstPickedAt: d.e.firstPickedAt,
      firstPrice: d.e.firstPrice,
      exitedAt: now,
      exitPrice: d.price ?? d.e.firstPrice,
      reason: d.reason,
      bestRank: d.e.bestRank,
    }));
  const exits = [...newExits, ...h.exits].slice(0, 30);
  await saveHistory({ updatedAt: now, active, exits });
  return { top: ranked, exits };
}

/** 이번 분석에서 다시 평가해야 할 기존 Top 10 종목 */
export async function activeSymbols(): Promise<string[]> {
  return Object.keys((await loadHistory()).active);
}
