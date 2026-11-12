// 서버 전용: 미국 전 종목 과매도 스캐너
// 1단계: NASDAQ Trader 종목 디렉터리 → Yahoo spark(20종목 일괄, 종가만)로 RSI·MACD·추세 계산
// 2단계: RSI ≤ 30 종목만 전체 OHLCV를 받아 분석 페이지와 동일한 판정 적용
// 서버에서만 사용 (instrumentation 스케줄러에서도 불러오므로 server-only 표시는 쓰지 않음)
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeSnapshot, summarize } from "./analysis";
import type { HorizonGrade } from "./grades";
import { autoFinal, buildInsight } from "./insight";
import { koreanName } from "./naver";
import { activeSymbols, selectTop } from "./ranking";
import { RED_FLAGS } from "./scorecard";
import type { Bar, Pick, PickExit, Tone, Trend } from "./types";
import { fetchChart } from "./yahoo";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DATA_DIR = path.join(process.cwd(), ".data");
const SCAN_FILE = path.join(DATA_DIR, "scan.json");
const UNIVERSE_FILE = path.join(DATA_DIR, "universe.json");

const BATCH = 20; // spark 최대 심볼 수
const WORKERS = 4;
const DEEP_RSI = 30; // 2단계 상세 분석 대상

export interface UniverseItem {
  symbol: string; // Yahoo 형식
  name: string;
  exchange: string;
  etf: boolean;
}

export interface ScanRow {
  symbol: string;
  name: string;
  exchange: string;
  etf: boolean;
  price: number;
  changePct: number | null;
  rsi: number | null;
  trend: Trend;
  macdHist: number | null;
  macdImproving: boolean | null;
  drawdown52: number | null;
  dollarVolume: number | null; // 당일 거래대금
  verdictTitle: string | null; // 2단계 분석된 종목만
  verdictTone: Tone | null;
  above50: boolean | null;
  above200: boolean | null;
}

export interface ScanResult {
  scannedAt: number;
  universe: number;
  rows: ScanRow[];
  failed: number;
  picks?: Pick[]; // 이번에 평가한 전체 후보
  top?: Pick[]; // 확정된 Top 10
  exits?: PickExit[]; // 최근 Top 10에서 빠진 종목
}

export interface ScanStatus {
  state: "idle" | "running" | "error";
  phase: string;
  done: number;
  total: number;
  startedAt: number | null;
  error: string | null;
}

// dev 서버 HMR에서도 상태가 유지되도록 globalThis에 보관
const g = globalThis as unknown as {
  __scan?: { status: ScanStatus; result: ScanResult | null; loaded: boolean; mtime: number };
};
const S = (g.__scan ??= {
  status: { state: "idle", phase: "", done: 0, total: 0, startedAt: null, error: null },
  result: null,
  loaded: false,
  mtime: 0,
});

export function getStatus(): ScanStatus {
  return S.status;
}

// 배포 모드: 분석은 GitHub Actions가 하고, 사이트는 data 브랜치의 결과 파일을 읽는다
// 예) DATA_BASE_URL=https://raw.githubusercontent.com/<사용자>/<저장소>/data
const DATA_BASE_URL = process.env.DATA_BASE_URL?.replace(/\/$/, "");
/** true면 이 서버는 분석을 직접 돌리지 않는다 (Vercel 등) */
export const REMOTE_DATA = !!DATA_BASE_URL;
const REMOTE_TTL_MS = 2 * 60 * 1000;
const R = globalThis as unknown as { __remoteScan?: { at: number; data: ScanResult | null } };

async function getRemoteResult(): Promise<ScanResult | null> {
  const c = R.__remoteScan;
  if (c && Date.now() - c.at < REMOTE_TTL_MS) return c.data;
  try {
    const res = await fetch(`${DATA_BASE_URL}/scan.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as ScanResult;
    R.__remoteScan = { at: Date.now(), data };
    return data;
  } catch {
    // 실패하면 이전 결과 유지, 1분 뒤 재시도
    R.__remoteScan = { at: Date.now() - REMOTE_TTL_MS + 60_000, data: c?.data ?? null };
    return c?.data ?? null;
  }
}

/** 저장된 결과. 다른 프로세스(스케줄러)가 파일을 갱신했으면 다시 읽는다 */
export async function getResult(): Promise<ScanResult | null> {
  if (REMOTE_DATA) return getRemoteResult();
  try {
    const st = await stat(SCAN_FILE);
    if (!S.loaded || st.mtimeMs > S.mtime) {
      S.result = JSON.parse(await readFile(SCAN_FILE, "utf8"));
      S.mtime = st.mtimeMs;
      S.loaded = true;
    }
  } catch {
    if (!S.loaded) S.result = null;
    S.loaded = true;
  }
  return S.result;
}

export function startScan(): boolean {
  if (S.status.state === "running") return false;
  S.status = { state: "running", phase: "종목 목록 불러오는 중", done: 0, total: 0, startedAt: Date.now(), error: null };
  runScan().catch((e: Error) => {
    S.status = { ...S.status, state: "error", error: e.message };
  });
  return true;
}

// ───────── 종목 목록 ─────────

const EXCLUDE_NAME = /\b(warrants?|rights?|units?|preferred|depositary shares? representing.*preferred|notes due|debentures?|% notes|subordinated|trust preferred)\b/i;
const EXCHANGE_CODE: Record<string, string> = { N: "NYSE", A: "NYSE American", P: "NYSE Arca", Z: "Cboe", V: "IEX" };

function cleanName(n: string) {
  return n
    .replace(/\s*-\s*(Class [A-Z] )?(Common Stock|Ordinary Shares|Common Shares).*$/i, "")
    .replace(/\s+(Common Stock|Ordinary Shares|Common Shares)\s*$/i, "")
    .trim();
}

async function fetchText(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`종목 목록 다운로드 실패 (HTTP ${res.status})`);
  return res.text();
}

export async function loadUniverse(): Promise<UniverseItem[]> {
  try {
    const cached = JSON.parse(await readFile(UNIVERSE_FILE, "utf8")) as { at: number; items: UniverseItem[] };
    if (Date.now() - cached.at < 24 * 60 * 60 * 1000 && cached.items.length > 1000) return cached.items;
  } catch {
    /* 없으면 새로 받음 */
  }

  const [nasdaq, other] = await Promise.all([
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"),
  ]);
  const items = new Map<string, UniverseItem>();
  const add = (raw: string, name: string, exchange: string, etf: boolean, test: boolean) => {
    if (test || !raw || raw.includes("$") || EXCLUDE_NAME.test(name)) return;
    if (/^File Creation Time/i.test(raw)) return;
    const symbol = raw.replace(/\./g, "-").toUpperCase(); // BRK.B → BRK-B
    if (!/^[A-Z][A-Z0-9-]{0,9}$/.test(symbol)) return;
    if (!items.has(symbol)) items.set(symbol, { symbol, name: cleanName(name), exchange, etf });
  };

  // Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  for (const line of nasdaq.split(/\r?\n/).slice(1)) {
    const f = line.split("|");
    if (f.length < 8) continue;
    add(f[0], f[1], "NASDAQ", f[6] === "Y", f[3] === "Y");
  }
  // ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  for (const line of other.split(/\r?\n/).slice(1)) {
    const f = line.split("|");
    if (f.length < 8) continue;
    add(f[0], f[1], EXCHANGE_CODE[f[2]] ?? f[2], f[4] === "Y", f[6] === "Y");
  }

  const list = Array.from(items.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(UNIVERSE_FILE, JSON.stringify({ at: Date.now(), items: list }));
  return list;
}

// ───────── 시세 ─────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string): Promise<Response | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
      if (res.status === 429 || res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      return res;
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

interface SparkMeta {
  regularMarketPrice?: number;
  regularMarketTime?: number;
  regularMarketVolume?: number;
  regularMarketChangePercent?: number;
  gmtoffset?: number;
}

interface SparkItem {
  symbol: string;
  response?: { meta?: SparkMeta; timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[];
}

async function sparkBatch(symbols: string[]): Promise<Map<string, { bars: Bar[]; meta: SparkMeta }>> {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}&range=1y&interval=1d`;
  const out = new Map<string, { bars: Bar[]; meta: SparkMeta }>();
  const res = await fetchWithRetry(url);
  if (!res || !res.ok) return out;
  const json = (await res.json()) as { spark?: { result?: SparkItem[] } };
  for (const item of json.spark?.result ?? []) {
    const r = item.response?.[0];
    const ts = r?.timestamp ?? [];
    const closes = r?.indicators?.quote?.[0]?.close ?? [];
    const meta = r?.meta ?? {};
    const offset = meta.gmtoffset ?? 0;
    const day = (t: number) => new Date((t + offset) * 1000).toISOString().slice(0, 10);
    const bars: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      let c = closes[i];
      // 당일 봉이 비어 있으면 실시간 가격으로 채움
      if (c == null && i === ts.length - 1 && meta.regularMarketPrice != null && meta.regularMarketTime && day(ts[i]) === day(meta.regularMarketTime)) {
        c = meta.regularMarketPrice;
      }
      if (c == null || Number.isNaN(c)) continue;
      bars.push({ time: ts[i], open: c, high: c, low: c, close: c, volume: 0 });
    }
    if (bars.length >= 30) out.set(item.symbol.toUpperCase(), { bars, meta });
  }
  return out;
}

// ───────── 추천 후보 ─────────

const PICK_MIN_PRICE = 3;
const PICK_MIN_DV = 2_000_000; // 당일 거래대금 200만 달러 이상

const pickGrade = (g: HorizonGrade) => ({ grade: g.grade, label: g.label, tone: g.tone, expected: g.expected });

async function buildPick(row: ScanRow): Promise<Pick | null> {
  const chart = await fetchChart(row.symbol, "2y");
  const ins = await buildInsight(row.symbol, chart);
  const f = ins.fundamentals;
  // 한국 기업(미국 상장 ADR 포함)은 제외
  if (f?.country && /korea/i.test(f.country)) return null;
  const r = autoFinal(ins, chart.meta.price);
  const flags = RED_FLAGS.filter((x) => r.flagsOn[x.key]).map((x) => x.label);

  let excludeReason: string | null = null;
  if (flags.length) excludeReason = `회피 신호: ${flags.join("·")} (${Object.values(ins.auto.flags).join(" / ")})`;
  else if (r.longTermOk === false)
    excludeReason = `장기 보유 부적합: ${(r.scores.growth ?? 0) < 13 ? `실적·성장 ${r.scores.growth}/25` : `재무 ${r.scores.balance}/15`}`;
  else if (r.scored < 4) excludeReason = "재무 데이터 부족으로 평가 불가";

  const nameKo = await koreanName(row.symbol).catch(() => null);
  return {
    symbol: row.symbol,
    name: chart.meta.name || row.name,
    nameKo,
    sectorKo: ins.sectorKo,
    price: chart.meta.price,
    changePct: row.changePct,
    rsi: row.rsi,
    marketCap: f?.marketCap ?? null,
    total: r.total,
    scores: r.scores,
    grade: r.grade.title,
    gradeTone: r.grade.tone,
    longTermOk: r.longTermOk,
    excluded: excludeReason != null,
    excludeReason,
    flags,
    dropNatureLabel: ins.drop.natureLabel,
    dropTone: ins.drop.natureTone,
    dropBullets: ins.drop.bullets.slice(0, 4),
    tags: ins.drop.tagCounts.filter((t) => t.kind !== "positive").map((t) => ({ label: t.label, kind: t.kind })),
    fromHigh3m: ins.drop.fromHigh3m,
    fairValue: r.fairValue,
    shortGrade: pickGrade(ins.grades.short),
    longGrade: pickGrade(ins.grades.long),
    resilienceSummary: ins.resilience.summary,
  };
}

// ───────── 스캔 ─────────

/** 전체 분석 1회 실행 (GitHub Actions 스크립트에서 직접 호출) */
export async function runScanOnce(onProgress?: (s: ScanStatus) => void) {
  S.status = { state: "running", phase: "종목 목록 불러오는 중", done: 0, total: 0, startedAt: Date.now(), error: null };
  const timer = onProgress ? setInterval(() => onProgress(S.status), 10_000) : null;
  try {
    await runScan();
  } finally {
    if (timer) clearInterval(timer);
  }
}

async function runScan() {
  const universe = await loadUniverse();
  const batches: UniverseItem[][] = [];
  for (let i = 0; i < universe.length; i += BATCH) batches.push(universe.slice(i, i + BATCH));

  S.status = { ...S.status, phase: "1단계: 전 종목 지표 계산", done: 0, total: universe.length };
  const rows: ScanRow[] = [];
  let next = 0;

  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const data = await sparkBatch(batch.map((b) => b.symbol));
      for (const u of batch) {
        const d = data.get(u.symbol);
        if (!d) continue;
        const price = d.meta.regularMarketPrice ?? d.bars[d.bars.length - 1].close;
        const s = computeSnapshot(d.bars, price);
        rows.push({
          symbol: u.symbol,
          name: u.name,
          exchange: u.exchange,
          etf: u.etf,
          price,
          changePct: d.meta.regularMarketChangePercent ?? s.changePct,
          rsi: s.rsi,
          trend: s.trend,
          macdHist: s.macdHist,
          macdImproving: s.macdHist != null && s.macdHistPrev != null ? s.macdHist > s.macdHistPrev : null,
          drawdown52: s.drawdown52,
          dollarVolume: d.meta.regularMarketVolume != null ? d.meta.regularMarketVolume * price : null,
          verdictTitle: null,
          verdictTone: null,
          above50: s.sma50 != null ? price > s.sma50 : null,
          above200: s.sma200 != null ? price > s.sma200 : null,
        });
      }
      S.status = { ...S.status, done: Math.min(S.status.done + batch.length, universe.length) };
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, worker));

  // 2단계: 과매도 종목 상세 판정 (거래량·저점 포함)
  const deep = rows.filter((r) => r.rsi != null && r.rsi <= DEEP_RSI && r.price >= 1);
  S.status = { ...S.status, phase: "2단계: 과매도 종목 상세 판정", done: 0, total: deep.length };
  let k = 0;
  const deepWorker = async () => {
    while (k < deep.length) {
      const row = deep[k++];
      try {
        const q = summarize(await fetchChart(row.symbol, "2y"));
        Object.assign(row, {
          price: q.price,
          changePct: q.changePct,
          rsi: q.rsi,
          trend: q.trend,
          macdHist: q.macdHist,
          macdImproving: q.macdImproving,
          verdictTitle: q.verdict.title,
          verdictTone: q.verdict.tone,
        });
      } catch {
        /* 상세 실패 시 1단계 값 유지 */
      }
      S.status = { ...S.status, done: S.status.done + 1 };
      await sleep(100);
    }
  };
  await Promise.all(Array.from({ length: WORKERS }, deepWorker));

  if (rows.length < universe.length * 0.3) {
    throw new Error(`시세를 충분히 받지 못했습니다 (${rows.length}/${universe.length}). 잠시 후 다시 시도하세요.`);
  }

  // 3단계: 추천 후보 — 유동성 있는 과매도 주식에 하락 이유·재무·평가표 적용
  const pool = rows.filter(
    (r) => !r.etf && r.rsi != null && r.rsi <= DEEP_RSI && r.price >= PICK_MIN_PRICE && (r.dollarVolume ?? 0) >= PICK_MIN_DV,
  );
  // 기존 Top 10은 RSI가 30을 넘었어도(반등 중) 다시 평가해서 자리를 지킬지 판단
  const inPool = new Set(pool.map((r) => r.symbol));
  for (const sym of await activeSymbols()) {
    if (inPool.has(sym)) continue;
    const row = rows.find((r) => r.symbol === sym);
    if (row) pool.push(row);
  }
  S.status = { ...S.status, phase: "3단계: 추천 후보 하락 이유·재무 분석", done: 0, total: pool.length };
  const picks: Pick[] = [];
  let pi = 0;
  const pickWorker = async () => {
    while (pi < pool.length) {
      const row = pool[pi++];
      try {
        const p = await buildPick(row);
        if (p) picks.push(p);
      } catch {
        /* 건너뜀 */
      }
      S.status = { ...S.status, done: S.status.done + 1 };
      await sleep(150);
    }
  };
  await Promise.all(Array.from({ length: 3 }, pickWorker));
  picks.sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.total - a.total);
  const { top, exits } = await selectTop(picks);

  const result: ScanResult = { scannedAt: Date.now(), universe: universe.length, rows, failed: universe.length - rows.length, picks, top, exits };
  S.result = result;
  S.loaded = true;
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SCAN_FILE, JSON.stringify(result));
  S.mtime = (await stat(SCAN_FILE)).mtimeMs;
  S.status = { state: "idle", phase: "완료", done: 0, total: 0, startedAt: null, error: null };
}
