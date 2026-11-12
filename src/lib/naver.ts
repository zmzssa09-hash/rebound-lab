// 서버 전용: 네이버 증권 자동완성으로 미국 종목 한글명 검색/조회
// 서버에서만 사용 (instrumentation 스케줄러에서도 불러오므로 server-only 표시는 쓰지 않음)

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const TTL_MS = 24 * 60 * 60 * 1000;

export const HANGUL_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;

export interface KoHit {
  symbol: string; // 야후 형식 티커
  nameKo: string;
  exchange: string;
}

interface NaverItem {
  code?: string;
  name?: string;
  typeName?: string;
  nationCode?: string;
}

const g = globalThis as unknown as {
  __naver?: { search: Map<string, { at: number; hits: KoHit[] }>; names: Map<string, { at: number; name: string | null }> };
};
const C = (g.__naver ??= { search: new Map(), names: new Map() });

/** 네이버 코드 → 야후 티커 (BRK B → BRK-B, BF.B → BF-B) */
const toYahoo = (code: string) => code.trim().toUpperCase().replace(/[ .]/g, "-");

export async function searchKorean(q: string): Promise<KoHit[]> {
  const key = q.trim().toLowerCase();
  if (!key) return [];
  const hit = C.search.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.hits;

  let items: NaverItem[] = [];
  try {
    const res = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q.trim())}&target=stock,etf`, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      cache: "no-store",
    });
    if (res.ok) items = ((await res.json()) as { items?: NaverItem[] }).items ?? [];
  } catch {
    return [];
  }

  // 미국 종목만
  const hits = items
    .filter((x) => x.nationCode === "USA" && x.code && x.name)
    .map((x) => ({ symbol: toYahoo(x.code!), nameKo: x.name!, exchange: x.typeName ?? "" }));

  C.search.set(key, { at: Date.now(), hits });
  if (C.search.size > 2000) C.search.delete(C.search.keys().next().value as string);
  for (const h of hits) C.names.set(h.symbol, { at: Date.now(), name: h.nameKo });
  return hits;
}

/** 티커 → 한글 회사명 (없으면 null) */
export async function koreanName(symbol: string): Promise<string | null> {
  const sym = symbol.toUpperCase();
  if (sym.startsWith("^")) return null;
  const hit = C.names.get(sym);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.name;

  // BRK-B 같은 클래스 주식은 앞부분으로 검색
  const hits = await searchKorean(sym.split("-")[0]);
  const name = hits.find((h) => h.symbol === sym)?.nameKo ?? null;
  C.names.set(sym, { at: Date.now(), name });
  return name;
}

export async function koreanNames(symbols: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(
    symbols.map(async (s) => {
      const n = await koreanName(s).catch(() => null);
      if (n) out[s.toUpperCase()] = n;
    }),
  );
  return out;
}
