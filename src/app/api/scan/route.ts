import { HANGUL_RE, searchKorean } from "@/lib/naver";
import { getResult, getStatus, startScan, type ScanRow } from "@/lib/scanner";
import { ensureScheduler, LOCAL_SCHEDULER } from "@/lib/scheduler";

const SORTS: Record<string, (a: ScanRow, b: ScanRow) => number> = {
  rsi: (a, b) => (a.rsi ?? 999) - (b.rsi ?? 999),
  drawdown: (a, b) => (a.drawdown52 ?? 0) - (b.drawdown52 ?? 0),
  change: (a, b) => (a.changePct ?? 0) - (b.changePct ?? 0),
  dollarVolume: (a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0),
};

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const num = (k: string, d: number) => {
    const v = Number(sp.get(k));
    return sp.get(k) != null && Number.isFinite(v) ? v : d;
  };
  const rsiMax = num("rsiMax", 30);
  const minPrice = num("minPrice", 1);
  const minDv = num("minDv", 0);
  const type = sp.get("type") ?? "stock"; // stock | etf | all
  const trend = sp.get("trend") ?? ""; // up | down | mixed
  const verdict = sp.get("verdict") ?? ""; // good | warn | bad
  const q = (sp.get("q") ?? "").trim().toUpperCase();
  const sort = SORTS[sp.get("sort") ?? "rsi"] ?? SORTS.rsi;
  const limit = Math.min(num("limit", 100), 500);
  const offset = Math.max(num("offset", 0), 0);

  ensureScheduler(); // 장중 30분마다 자동 재분석
  const result = await getResult();
  const status = getStatus();

  if (!result) {
    return Response.json({ status, canScan: LOCAL_SCHEDULER, scannedAt: null, universe: 0, scanned: 0, stats: null, matched: 0, rows: [] });
  }

  // 한글 검색어면 네이버에서 티커 목록으로 변환
  const koSymbols = q && HANGUL_RE.test(q) ? new Set((await searchKorean(q)).map((h) => h.symbol)) : null;

  const pool = result.rows.filter((r) => (type === "all" ? true : type === "etf" ? r.etf : !r.etf));
  const filtered = pool
    .filter(
      (r) =>
        r.rsi != null &&
        r.rsi <= rsiMax &&
        r.price >= minPrice &&
        (minDv <= 0 || (r.dollarVolume ?? 0) >= minDv) &&
        (!trend || r.trend === trend) &&
        (!verdict || r.verdictTone === verdict) &&
        (!q || (koSymbols ? koSymbols.has(r.symbol) : r.symbol.includes(q) || r.name.toUpperCase().includes(q))),
    )
    .sort(sort);

  const oversold = pool.filter((r) => r.rsi != null && r.rsi <= 30);
  return Response.json({
    status,
    canScan: LOCAL_SCHEDULER,
    scannedAt: result.scannedAt,
    universe: result.universe,
    scanned: result.rows.length,
    stats: {
      pool: pool.length,
      oversold: oversold.length,
      oversoldPct: pool.length ? (oversold.length / pool.length) * 100 : 0,
      candidates: oversold.filter((r) => r.verdictTone === "good").length,
      falling: oversold.filter((r) => r.verdictTone === "bad").length,
    },
    matched: filtered.length,
    rows: filtered.slice(offset, offset + limit),
  });
}

export async function POST() {
  // 배포 환경에서는 GitHub Actions가 장중 30분마다 분석하므로 수동 실행 불가
  if (!LOCAL_SCHEDULER) return Response.json({ started: false, status: getStatus(), message: "장중 30분마다 자동 분석됩니다." });
  const started = startScan();
  return Response.json({ started, status: getStatus() });
}
