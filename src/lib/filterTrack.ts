// 서버 전용: 필터 검증 성적표 — "추천한 종목 vs 걸러낸 종목"
// 과매도(RSI 30 이하)로 분석한 모든 종목을 그룹별로 기록하고, 1주·4주 뒤 수익률을 비교한다.
// 백테스트로는 과거 재무제표가 없어 펀더멘털 필터(회피 신호·장기 보유 기준)를 검증할 수 없어서, 지금부터 실제로 기록한다.
//  그룹: top  = 추천 Top 10
//        pass = 필터는 통과했지만 점수가 모자라 Top 10 밖
//        flag = 회피 신호로 제외
//        long = 장기 보유 기준(성장성·재무 안정성) 미달로 제외
//        data = 재무 데이터 부족으로 제외
// 같은 종목은 28일에 한 번만 기록한다 (과매도가 길게 이어져도 한 번으로 셈).
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readDataFile } from "./dataFile";
import { closeOnOrAfter, stats, type PeriodStats } from "./track";
import type { Bar, Pick } from "./types";
import { fetchChart } from "./yahoo";

const FILE_NAME = "filter-track.json";
const FILE = path.join(process.cwd(), ".data", FILE_NAME);
const DAY = 86_400_000;
const REPEAT_DAYS = 28;
const KEEP_DAYS = 400;
const MAX_FETCH = 200; // 한 번 분석에 차트를 새로 받는 최대 종목 수 (나머지는 다음 분석 때)

export type FilterGroup = "top" | "pass" | "flag" | "long" | "data";

export const FILTER_GROUPS: { key: FilterGroup; label: string; desc: string }[] = [
  { key: "top", label: "추천 Top 10", desc: "사이트가 추천한 종목" },
  { key: "pass", label: "통과했지만 순위 밖", desc: "필터는 통과했지만 점수가 모자라 Top 10에 못 든 종목" },
  { key: "flag", label: "회피 신호로 제외", desc: "적자 확대·현금 소진·부채 과다 같은 회피 신호가 있어 뺀 종목" },
  { key: "long", label: "장기 보유 기준 미달", desc: "성장성이나 재무 안정성이 기준에 못 미쳐 뺀 종목" },
  { key: "data", label: "재무 데이터 부족", desc: "재무 정보가 모자라 평가하지 못한 종목" },
];

export interface FilterRec {
  s: string; // 종목
  g: FilterGroup;
  at: number; // 기록 시각 ms
  p: number; // 기록 당시 가격
  sp: number | null; // 기록 당시 SPY
  sc: number; // 점수
  w1: [number, number] | null; // 1주 뒤 [가격, SPY]
  w4: [number, number] | null; // 4주 뒤 [가격, SPY]
  l: [number, number] | null; // 최근 [가격, SPY]
}

export interface FilterFile {
  startedAt: number;
  updatedAt: number;
  records: FilterRec[];
}

async function load(): Promise<FilterFile | null> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as FilterFile;
  } catch {
    return null;
  }
}

export function groupOf(p: Pick, topSet: Set<string>): FilterGroup {
  if (topSet.has(p.symbol)) return "top";
  if (!p.excluded) return "pass";
  if (p.flags.length) return "flag";
  if (p.longTermOk === false) return "long";
  return "data";
}

/** 분석이 끝날 때마다 호출 */
export async function updateFilterTrack(picks: Pick[], top: Pick[], priceOf: (symbol: string) => number | null, now = Date.now()) {
  const f: FilterFile = (await load()) ?? { startedAt: now, updatedAt: now, records: [] };
  const charts = new Map<string, Bar[]>();
  let fetched = 0;
  const bars = async (s: string): Promise<Bar[] | null> => {
    if (charts.has(s)) return charts.get(s)!;
    if (fetched >= MAX_FETCH) return null;
    fetched++;
    try {
      const b = (await fetchChart(s, "2y")).bars;
      charts.set(s, b);
      return b;
    } catch {
      return null;
    }
  };
  const spyBars = await bars("SPY");
  const spyNow = spyBars?.length ? spyBars[spyBars.length - 1].close : null;

  // 1) 새 기록: 이번에 평가한 과매도 종목 (RSI 30 이하)
  const topSet = new Set(top.map((p) => p.symbol));
  const lastAt = new Map<string, number>();
  for (const r of f.records) lastAt.set(r.s, Math.max(lastAt.get(r.s) ?? 0, r.at));
  for (const p of picks) {
    if (p.rsi == null || p.rsi > 30) continue;
    if (now - (lastAt.get(p.symbol) ?? 0) < REPEAT_DAYS * DAY) continue;
    f.records.push({ s: p.symbol, g: groupOf(p, topSet), at: now, p: p.live?.price ?? p.price, sp: spyNow, sc: p.total, w1: null, w4: null, l: null });
  }

  // 2) 1주·4주 결과 (그날 종가가 확정된 뒤 하루 여유) + 최근 가격
  for (const r of f.records) {
    const px = priceOf(r.s);
    if (px != null && spyNow != null && !r.w4) r.l = [px, spyNow];
    for (const [key, days] of [["w1", 7], ["w4", 28]] as const) {
      if (r[key] || now < r.at + (days + 1) * DAY) continue;
      const b = await bars(r.s);
      if (!b || !spyBars) continue;
      const target = r.at + days * DAY;
      const price = closeOnOrAfter(b, target);
      const spy = closeOnOrAfter(spyBars, target);
      if (price != null && spy != null) r[key] = [price, spy];
    }
    if (r.w4) r.l = null;
  }

  f.records = f.records.filter((r) => now - r.at < KEEP_DAYS * DAY);
  f.updatedAt = now;
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(f));
  return f;
}

// ───────── 통계 (화면용) ─────────

export interface FilterGroupStats {
  key: FilterGroup;
  label: string;
  desc: string;
  n: number;
  w1: PeriodStats;
  w4: PeriodStats;
  current: PeriodStats; // 4주가 안 된 기록의 지금까지 수익률
}

export function filterStats(f: FilterFile | null) {
  const recs = f?.records ?? [];
  const pc = (a: number, b: number) => ((b - a) / a) * 100;
  const pair = (r: FilterRec, pt: [number, number] | null) => (pt ? { r: pc(r.p, pt[0]), s: r.sp ? pc(r.sp, pt[1]) : null } : null);
  const of = (rs: FilterRec[], k: "w1" | "w4" | "l") =>
    stats(rs.map((r) => pair(r, r[k])).filter((x): x is { r: number; s: number | null } => x != null));
  const groups: FilterGroupStats[] = FILTER_GROUPS.map((g) => {
    const rs = recs.filter((r) => r.g === g.key);
    return { ...g, n: rs.length, w1: of(rs, "w1"), w4: of(rs, "w4"), current: of(rs, "l") };
  });
  // 추천(Top 10 + 통과) vs 제외(회피·장기 미달) — 필터가 제 몫을 하는지 한눈에
  const passed = recs.filter((r) => r.g === "top" || r.g === "pass");
  const cut = recs.filter((r) => r.g === "flag" || r.g === "long");
  return {
    startedAt: f?.startedAt ?? null,
    updatedAt: f?.updatedAt ?? null,
    total: recs.length,
    groups,
    passed: { w1: of(passed, "w1"), w4: of(passed, "w4") },
    cut: { w1: of(cut, "w1"), w4: of(cut, "w4") },
  };
}

export type FilterStats = ReturnType<typeof filterStats>;

export async function getFilterStats(): Promise<FilterStats> {
  return filterStats(await readDataFile<FilterFile>(FILE_NAME));
}
