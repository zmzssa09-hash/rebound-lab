// 서버 전용: Yahoo quoteSummary(재무·일정·업종) + 종목 뉴스 + 비교 기업
// 서버에서만 사용 (instrumentation 스케줄러에서도 불러오므로 server-only 표시는 쓰지 않음)
import type { Fundamentals, NewsItem } from "./types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TTL_MS = 6 * 60 * 60 * 1000;

// ───────── crumb 인증 ─────────

const g = globalThis as unknown as {
  __yf5?: {
    auth: { cookie: string; crumb: string; at: number } | null;
    fund: Map<string, { at: number; data: Fundamentals | null }>;
    news: Map<string, { at: number; data: NewsItem[] }>;
  };
};
const C = (g.__yf5 ??= { auth: null, fund: new Map(), news: new Map() });

async function getAuth(force = false) {
  if (!force && C.auth && Date.now() - C.auth.at < 6 * 60 * 60 * 1000) return C.auth;
  const r1 = await fetch("https://fc.yahoo.com", { headers: { "User-Agent": UA }, redirect: "manual", cache: "no-store" });
  const cookie = r1.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const r2 = await fetch("https://query1.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
    cache: "no-store",
  });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes("<")) throw new Error("재무 데이터 인증 실패");
  C.auth = { cookie, crumb, at: Date.now() };
  return C.auth;
}

type Raw = { raw?: number; fmt?: string } | number | string | null | undefined;
const n = (v: Raw): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "object" && typeof v.raw === "number") return v.raw;
  return null;
};

/** 주식 수 이력 (희석 확인용): 최근 분기 희석 평균 주식 수 + 1년 전 대비 발행주식 수 변화 */
async function getShareHistory(sym: string): Promise<{ diluted: number | null; changeYoY: number | null; fcf: number | null; ocf: number | null }> {
  try {
    const p2 = Math.floor(Date.now() / 1000);
    const p1 = p2 - 2 * 365 * 86400;
    const res = await fetch(
      `https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?type=quarterlyDilutedAverageShares,quarterlyOrdinarySharesNumber,trailingFreeCashFlow,trailingOperatingCashFlow&period1=${p1}&period2=${p2}`,
      { headers: { "User-Agent": UA }, cache: "no-store" },
    );
    if (!res.ok) return { diluted: null, changeYoY: null, fcf: null, ocf: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const j: any = await res.json();
    const series = (type: string): number[] => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = (j?.timeseries?.result ?? []).find((x: any) => x?.meta?.type?.[0] === type);
      return ((r?.[type] ?? []) as ({ asOfDate: string; reportedValue?: { raw?: number } } | null)[])
        .filter((x) => x && typeof x.reportedValue?.raw === "number")
        .sort((a, b) => a!.asOfDate.localeCompare(b!.asOfDate))
        .map((x) => x!.reportedValue!.raw!);
    };
    const dil = series("quarterlyDilutedAverageShares");
    const ord = series("quarterlyOrdinarySharesNumber");
    const base = ord.length >= 5 ? ord : dil;
    const changeYoY = base.length >= 5 && base[base.length - 5] > 0 ? base[base.length - 1] / base[base.length - 5] - 1 : null;
    // 현금흐름표 기준 최근 12개월 FCF(영업현금흐름 − 설비투자). financialData의 FCF는 추정치(levered)라 오차가 큼
    const fcf = series("trailingFreeCashFlow");
    const ocf = series("trailingOperatingCashFlow");
    return { diluted: dil.length ? dil[dil.length - 1] : null, changeYoY, fcf: fcf.length ? fcf[fcf.length - 1] : null, ocf: ocf.length ? ocf[ocf.length - 1] : null };
  } catch {
    return { diluted: null, changeYoY: null, fcf: null, ocf: null };
  }
}

export async function getFundamentals(symbol: string): Promise<Fundamentals | null> {
  const sym = symbol.toUpperCase();
  if (sym.startsWith("^")) return null;
  const hit = C.fund.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const modules = "financialData,defaultKeyStatistics,summaryDetail,calendarEvents,assetProfile,incomeStatementHistoryQuarterly,price";
  let json: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const auth = await getAuth(attempt > 0);
      const res = await fetch(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
        { headers: { "User-Agent": UA, Cookie: auth.cookie }, cache: "no-store" },
      );
      if (res.status === 401 || res.status === 403) continue; // crumb 만료 → 재발급
      if (res.status === 404) break;
      if (res.ok) json = await res.json();
      break;
    } catch {
      /* 재시도 */
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = (json as any)?.quoteSummary?.result?.[0];
  if (!r) {
    C.fund.set(sym, { at: Date.now(), data: null });
    return null;
  }
  const fd = r.financialData ?? {};
  const ks = r.defaultKeyStatistics ?? {};
  const sd = r.summaryDetail ?? {};
  const ap = r.assetProfile ?? {};
  const pr = r.price ?? {};
  const earn = r.calendarEvents?.earnings?.earningsDate ?? [];
  const qs = r.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
  const sh = await getShareHistory(sym);

  const data: Fundamentals = {
    symbol: sym,
    sector: ap.sector ?? null,
    industry: ap.industry ?? null,
    country: ap.country ?? null,
    summary: ap.longBusinessSummary ?? null,
    marketCap: n(sd.marketCap) ?? n(pr.marketCap),
    revenue: n(fd.totalRevenue),
    revenueGrowth: n(fd.revenueGrowth),
    earningsGrowth: n(fd.earningsGrowth),
    grossMargin: n(fd.grossMargins),
    operatingMargin: n(fd.operatingMargins),
    profitMargin: n(fd.profitMargins),
    freeCashflow: sh.fcf ?? n(fd.freeCashflow),
    operatingCashflow: sh.ocf ?? n(fd.operatingCashflow),
    cash: n(fd.totalCash),
    debt: n(fd.totalDebt),
    currentRatio: n(fd.currentRatio),
    trailingPE: n(sd.trailingPE),
    forwardPE: n(ks.forwardPE) ?? n(sd.forwardPE),
    evToEbitda: n(ks.enterpriseToEbitda),
    evToRevenue: n(ks.enterpriseToRevenue),
    // 애널리스트 목표가·투자의견은 사용하지 않음 (자체 적정가 모델 사용)
    financialCurrency: typeof fd.financialCurrency === "string" ? fd.financialCurrency : null,
    sharesOutstanding: n(ks.sharesOutstanding) ?? n(ks.impliedSharesOutstanding),
    bookValuePerShare: n(ks.bookValue),
    priceToBook: n(ks.priceToBook),
    dilutedShares: sh.diluted,
    sharesChangeYoY: sh.changeYoY,
    enterpriseValue: n(ks.enterpriseValue),
    ebitda: n(fd.ebitda),
    forwardEps: n(ks.forwardEps),
    trailingEps: n(ks.trailingEps),
    shortPercentFloat: n(ks.shortPercentOfFloat),
    beta: n(ks.beta) ?? n(sd.beta),
    earningsDate: n(earn[0]),
    quarterlyRevenue: (qs as { endDate?: { fmt?: string }; totalRevenue?: Raw }[])
      .map((q) => ({ date: q.endDate?.fmt ?? "", revenue: n(q.totalRevenue) }))
      .filter((q: { revenue: number | null }) => q.revenue != null) as { date: string; revenue: number }[],
  };
  C.fund.set(sym, { at: Date.now(), data });
  if (C.fund.size > 3000) C.fund.delete(C.fund.keys().next().value as string);
  return data;
}

/** 동종업계 비교 기업 (야후 유사 종목 → 같은 업종의 미국 상장 기업만, 최대 6개) */
export async function getPeers(symbol: string, sector: string | null): Promise<Fundamentals[]> {
  const sym = symbol.toUpperCase();
  let peers: string[] = [];
  try {
    const res = await fetch(`https://query2.finance.yahoo.com/v6/finance/recommendationsbysymbol/${encodeURIComponent(sym)}`, {
      headers: { "User-Agent": UA },
      cache: "no-store",
    });
    if (res.ok) {
      const j = (await res.json()) as { finance?: { result?: { recommendedSymbols?: { symbol: string }[] }[] } };
      peers = (j.finance?.result?.[0]?.recommendedSymbols ?? [])
        .map((x) => x.symbol.toUpperCase())
        .filter((s) => /^[A-Z][A-Z0-9-]{0,9}$/.test(s) && s !== sym); // 점(.)이 붙은 해외 종목 제외
    }
  } catch {
    return [];
  }
  const fs = await Promise.all(peers.slice(0, 8).map((s) => getFundamentals(s).catch(() => null)));
  return fs
    .filter((f): f is Fundamentals => !!f && (!sector || f.sector === sector) && !/korea/i.test(f.country ?? ""))
    .slice(0, 6);
}

export async function getNews(symbol: string, count = 15): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  const hit = C.news.get(sym);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.data;
  let data: NewsItem[] = [];
  try {
    const res = await fetch(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=0&newsCount=${count}`,
      { headers: { "User-Agent": UA }, cache: "no-store" },
    );
    if (res.ok) {
      const j = (await res.json()) as {
        news?: { title?: string; publisher?: string; link?: string; providerPublishTime?: number; relatedTickers?: string[] }[];
      };
      data = (j.news ?? [])
        // 다른 종목 뉴스가 섞이지 않도록 관련 티커 확인
        .filter((x) => x.title && x.providerPublishTime && (!x.relatedTickers || x.relatedTickers.includes(sym)))
        .map((x) => ({ title: x.title!, publisher: x.publisher ?? "", link: x.link ?? "", time: x.providerPublishTime! }));
    }
  } catch {
    /* 뉴스 없음 */
  }
  C.news.set(sym, { at: Date.now(), data });
  if (C.news.size > 3000) C.news.delete(C.news.keys().next().value as string);
  return data;
}

export { SECTOR_ETF, SECTOR_KO } from "./ko";
