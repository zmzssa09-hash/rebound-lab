// 서버 전용: Yahoo Finance 비공식 chart API 래퍼 (짧은 메모리 캐시 포함)
// 서버에서만 사용 (instrumentation 스케줄러에서도 불러오므로 server-only 표시는 쓰지 않음)
import type { Bar, ChartData } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; data: ChartData }>();

export const SYMBOL_RE = /^[A-Za-z0-9.^=\-]{1,15}$/;

/** 미국 상장 여부: 달러 표시 + 미국 거래소 시간대 (한국·캐나다 등 해외 종목 제외) */
const US_TZ = new Set(["America/New_York", "America/Chicago"]);
export function isUsListing(currency?: string, tz?: string) {
  return currency === "USD" && !!tz && US_TZ.has(tz);
}

/** Yahoo 검색 결과의 미국 거래소 코드 */
const US_EXCHANGES = new Set([
  "NMS", "NGM", "NCM", "NAS", // NASDAQ
  "NYQ", "NYS", "ASE", "PCX", "BTS", "BATS", // NYSE, NYSE American, Arca, Cboe BZX
  "WCB", "CBO", "NIM", "SNP", "DJI", // 지수 (VIX, S&P, Dow 등)
]);

export class YahooError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

export async function fetchChart(symbol: string, range = "2y"): Promise<ChartData> {
  const sym = symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(sym)) throw new YahooError("잘못된 종목 코드입니다.", 400);

  const key = `${sym}|${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d&includePrePost=false`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, cache: "no-store" });
  } catch {
    throw new YahooError("시세 서버에 연결하지 못했습니다.");
  }
  if (res.status === 404) throw new YahooError(`'${sym}' 종목을 찾을 수 없습니다.`, 404);
  if (!res.ok) throw new YahooError(`시세 조회 실패 (HTTP ${res.status})`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    const msg = json?.chart?.error?.description;
    throw new YahooError(msg ? `'${sym}': ${msg}` : `'${sym}' 데이터가 없습니다.`, 404);
  }

  const ts: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].some((v) => v == null || Number.isNaN(v))) continue;
    bars.push({ time: ts[i], open: o, high: h, low: l, close: c, volume: q.volume?.[i] ?? 0 });
  }
  if (bars.length === 0) throw new YahooError(`'${sym}' 가격 기록이 없습니다.`, 404);

  const m = result.meta ?? {};
  if (!isUsListing(m.currency, m.exchangeTimezoneName)) {
    throw new YahooError(`'${sym}'는 미국 상장 종목이 아닙니다. 이 사이트는 미국 주식만 지원합니다.`, 400);
  }
  const price: number = m.regularMarketPrice ?? bars[bars.length - 1].close;
  const marketTime: number = m.regularMarketTime ?? bars[bars.length - 1].time;

  // 거래소 현지 날짜 기준으로 비교
  const offset: number = m.gmtoffset ?? 0;
  const day = (t: number) => new Date((t + offset) * 1000).toISOString().slice(0, 10);

  // 긴 기간 조회 시 당일 봉이 비어(null) 오는 경우가 있어 실시간 메타로 채운다
  if (m.regularMarketPrice != null && day(bars[bars.length - 1].time) < day(marketTime)) {
    const lastTs = ts[ts.length - 1];
    const prev = bars[bars.length - 1].close;
    bars.push({
      time: lastTs && day(lastTs) === day(marketTime) ? lastTs : marketTime,
      open: q.open?.[ts.length - 1] ?? prev,
      high: Math.max(m.regularMarketDayHigh ?? price, price),
      low: Math.min(m.regularMarketDayLow ?? price, price),
      close: price,
      volume: m.regularMarketVolume ?? 0,
    });
  }

  // 마지막 봉이 오늘 봉이면 그 전 봉 종가가 전일 종가
  const lastBar = bars[bars.length - 1];
  const previousClose =
    day(lastBar.time) === day(marketTime) ? (bars[bars.length - 2]?.close ?? null) : lastBar.close;

  const data: ChartData = {
    meta: {
      symbol: m.symbol ?? sym,
      name: m.longName ?? m.shortName ?? sym,
      currency: m.currency ?? "USD",
      exchange: m.fullExchangeName ?? m.exchangeName ?? "",
      instrumentType: m.instrumentType ?? "",
      price,
      previousClose,
      marketTime,
      fiftyTwoWeekHigh: m.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: m.fiftyTwoWeekLow ?? null,
    },
    bars,
    fetchedAt: Date.now(),
  };
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 300) cache.delete(cache.keys().next().value as string);
  return data;
}

export interface SearchHit {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
}

export async function searchSymbols(q: string): Promise<SearchHit[]> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`;
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new YahooError(`검색 실패 (HTTP ${res.status})`);
  type RawHit = Record<string, string | boolean | undefined>;
  const json: { quotes?: RawHit[] } = await res.json();
  return (json.quotes ?? [])
    .filter((x) => x.symbol && x.isYahooFinance !== false && US_EXCHANGES.has(String(x.exchange)))
    .map((x): SearchHit => ({
      symbol: String(x.symbol),
      name: String(x.longname ?? x.shortname ?? x.symbol),
      exchange: String(x.exchDisp ?? x.exchange ?? ""),
      type: String(x.typeDisp ?? x.quoteType ?? ""),
    }));
}
