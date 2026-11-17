// 서버 전용: 추천 성적표
// Top 10에 들어온 모든 종목을 기록하고, 1주·4주 뒤와 추천 종료 시점의 수익률을 S&P 500(SPY)과 비교한다.
// 1주·4주 뒤 가격은 '추천 시각 + 7일/28일 시점의 종가'로, 분석 시각과 상관없이 일봉에서 정확히 계산한다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bar, Pick, PickExit } from "./types";
import { fetchChart } from "./yahoo";

const FILE = path.join(process.cwd(), ".data", "track.json");
const DAY = 86_400_000;

export interface TrackPoint {
  price: number;
  spy: number;
  at: number; // ms
}

export interface TrackRecord {
  id: string; // symbol-추천시각
  symbol: string;
  name: string;
  nameKo: string | null;
  pickedAt: number;
  entry: number; // 추천 당시 가격
  spyEntry: number | null;
  grade: string | null; // 추천 당시 등급
  total: number | null; // 추천 당시 점수
  w1: TrackPoint | null; // 1주 뒤
  w4: TrackPoint | null; // 4주 뒤
  exit: (TrackPoint & { reason: string }) | null; // 추천 종료
  last: TrackPoint | null; // 진행 중이면 최근 가격
}

export interface TrackFile {
  startedAt?: number; // 기록 시작 시각
  updatedAt: number;
  records: TrackRecord[];
}

export async function loadTrack(): Promise<TrackFile> {
  try {
    const t = JSON.parse(await readFile(FILE, "utf8")) as TrackFile;
    return { updatedAt: t.updatedAt ?? 0, records: t.records ?? [] };
  } catch {
    return { updatedAt: 0, records: [] };
  }
}

/** t(ms) 시점의 가격 = 그때까지 시작된 마지막 거래일의 종가 (장 시작 전이면 전날 종가) */
function closeOnOrAfter(bars: Bar[], t: number): number | null {
  let hit: Bar | null = null;
  for (const b of bars) {
    if (b.time * 1000 <= t) hit = b;
    else break;
  }
  return hit ? hit.close : null;
}

const chartCache = new Map<string, Bar[]>();
async function dailyBars(symbol: string): Promise<Bar[]> {
  if (chartCache.has(symbol)) return chartCache.get(symbol)!;
  const c = await fetchChart(symbol, "2y");
  chartCache.set(symbol, c.bars);
  return c.bars;
}

/**
 * 분석이 끝날 때마다 호출: 새 추천 등록, 종료 처리, 1주·4주 결과 채우기
 * @param top 이번 Top 10 (firstPickedAt·firstPrice 포함)
 * @param exits 이번에 새로 빠진 종목
 */
export async function updateTrack(top: Pick[], exits: PickExit[], now = Date.now()): Promise<TrackFile> {
  chartCache.clear();
  const t = await loadTrack();
  const spyBars = await dailyBars("SPY").catch(() => [] as Bar[]);
  const spyNow = spyBars.length ? spyBars[spyBars.length - 1].close : null;
  const byId = new Map(t.records.map((r) => [r.id, r]));
  const idOf = (symbol: string, at: number) => `${symbol}-${at}`;

  // 1) 새 추천 등록 (진행 중인 기록이 없는 Top 10 종목)
  for (const p of top) {
    if (!p.firstPickedAt || !p.firstPrice) continue;
    const id = idOf(p.symbol, p.firstPickedAt);
    const r = byId.get(id);
    if (!r) {
      const rec: TrackRecord = {
        id,
        symbol: p.symbol,
        name: p.name,
        nameKo: p.nameKo,
        pickedAt: p.firstPickedAt,
        entry: p.firstPrice,
        spyEntry: closeOnOrAfter(spyBars, p.firstPickedAt) ?? spyNow,
        grade: p.gradeLetter ?? null,
        total: p.total,
        w1: null,
        w4: null,
        exit: null,
        last: null,
      };
      t.records.push(rec);
      byId.set(id, rec);
    }
    const rec = byId.get(id)!;
    const price = p.live?.price ?? p.price;
    if (spyNow) rec.last = { price, spy: spyNow, at: now };
  }

  // 2) 종료 처리
  for (const e of exits) {
    const rec = byId.get(idOf(e.symbol, e.firstPickedAt));
    if (rec && !rec.exit) {
      const spy = closeOnOrAfter(spyBars, e.exitedAt) ?? spyNow ?? rec.spyEntry;
      if (spy == null) continue;
      rec.exit = { price: e.exitPrice, spy, at: e.exitedAt, reason: e.reason };
      rec.last = null;
    }
  }

  // 3) 1주·4주 결과 채우기 (기간이 지난 기록만, 종료 여부와 상관없이)
  for (const rec of t.records) {
    for (const [key, days] of [["w1", 7], ["w4", 28]] as const) {
      // 그날 종가가 확정된 뒤(하루 여유)에 기록
      if (rec[key] || now < rec.pickedAt + (days + 1) * DAY) continue;
      try {
        const target = rec.pickedAt + days * DAY;
        const bars = await dailyBars(rec.symbol);
        const price = closeOnOrAfter(bars, target);
        const spy = closeOnOrAfter(spyBars, target);
        if (price != null && spy != null) rec[key] = { price, spy, at: target };
      } catch {
        /* 다음 분석 때 다시 시도 */
      }
    }
  }

  t.startedAt ??= now;
  t.updatedAt = now;
  t.records.sort((a, b) => b.pickedAt - a.pickedAt);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(t));
  return t;
}

// ───────── 통계 (화면용) ─────────

export interface PeriodStats {
  n: number;
  winRate: number | null; // 수익 난 비율
  avg: number | null; // 평균 수익률 %
  median: number | null;
  spyAvg: number | null; // 같은 기간 S&P 500 평균 %
  beatRate: number | null; // S&P 500보다 잘한 비율
}

const pct = (a: number, b: number) => ((b - a) / a) * 100;
const med = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function stats(pairs: { r: number; s: number | null }[]): PeriodStats {
  const n = pairs.length;
  if (!n) return { n: 0, winRate: null, avg: null, median: null, spyAvg: null, beatRate: null };
  const withSpy = pairs.filter((p) => p.s != null);
  return {
    n,
    winRate: pairs.filter((p) => p.r > 0).length / n,
    avg: pairs.reduce((a, p) => a + p.r, 0) / n,
    median: med(pairs.map((p) => p.r)),
    spyAvg: withSpy.length ? withSpy.reduce((a, p) => a + p.s!, 0) / withSpy.length : null,
    beatRate: withSpy.length ? withSpy.filter((p) => p.r > p.s!).length / withSpy.length : null,
  };
}

export function trackStats(records: TrackRecord[]) {
  const ret = (r: TrackRecord, pt: TrackPoint | null) =>
    pt ? { r: pct(r.entry, pt.price), s: r.spyEntry ? pct(r.spyEntry, pt.spy) : null } : null;
  const pick = (f: (r: TrackRecord) => { r: number; s: number | null } | null) =>
    records.map(f).filter((x): x is { r: number; s: number | null } => x != null);
  return {
    total: records.length,
    open: records.filter((r) => !r.exit).length,
    closed: records.filter((r) => r.exit).length,
    w1: stats(pick((r) => ret(r, r.w1))),
    w4: stats(pick((r) => ret(r, r.w4))),
    exit: stats(pick((r) => ret(r, r.exit))),
    current: stats(pick((r) => (r.exit ? null : ret(r, r.last)))),
  };
}

export type TrackStats = ReturnType<typeof trackStats>;

/**
 * 성적표 첫 기록: 지금 Top 10에 있는 종목부터 기록을 시작한다.
 * (그 전에 빠진 종목은 모델을 고치는 과정에서 몇 분 만에 빠진 경우가 많아 실제 성과로 보기 어려워 제외)
 */
export async function seedTrackFromHistory(
  active: { symbol: string; name: string; nameKo: string | null; firstPickedAt: number; firstPrice: number }[],
  exits: PickExit[],
) {
  const t = await loadTrack();
  if (t.records.length) return;
  const fake = (x: { symbol: string; name: string; nameKo: string | null; firstPickedAt: number; firstPrice: number }) =>
    ({ symbol: x.symbol, name: x.name, nameKo: x.nameKo, firstPickedAt: x.firstPickedAt, firstPrice: x.firstPrice, price: x.firstPrice, total: 0 }) as unknown as Pick;
  void exits;
  await updateTrack(active.map(fake), []);
  const t2 = await loadTrack();
  for (const r of t2.records) {
    if (r.total === 0) r.total = null;
  }
  await writeFile(FILE, JSON.stringify(t2));
}

// ───────── 읽기 (배포 서버는 GitHub data 브랜치에서) ─────────
const BASE = process.env.DATA_BASE_URL?.replace(/\/$/, "");
const TC = globalThis as unknown as { __track?: { at: number; data: TrackFile } };

export async function getTrack(): Promise<TrackFile> {
  if (!BASE) return loadTrack();
  const c = TC.__track;
  if (c && Date.now() - c.at < 2 * 60_000) return c.data;
  try {
    const res = await fetch(`${BASE}/track.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as TrackFile;
    TC.__track = { at: Date.now(), data };
    return data;
  } catch {
    return c?.data ?? { updatedAt: 0, records: [] };
  }
}
