import { HANGUL_RE, searchKorean } from "@/lib/naver";
import { searchSymbols, type SearchHit } from "@/lib/yahoo";

export interface SearchResult extends SearchHit {
  nameKo: string | null;
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1 || q.length > 40) return Response.json({ results: [] });

  // 한글 검색: 네이버 증권(미국 종목만)
  if (HANGUL_RE.test(q)) {
    const hits = await searchKorean(q);
    const results: SearchResult[] = hits.slice(0, 10).map((h) => ({
      symbol: h.symbol,
      name: h.nameKo,
      nameKo: h.nameKo,
      exchange: h.exchange,
      type: "",
    }));
    return Response.json({ results });
  }

  // 영문·티커 검색: 야후 결과에 한글명 붙이기
  try {
    const [yahoo, ko] = await Promise.all([searchSymbols(q), searchKorean(q).catch(() => [])]);
    const koMap = new Map(ko.map((h) => [h.symbol, h.nameKo]));
    const results: SearchResult[] = yahoo.map((h) => ({ ...h, nameKo: koMap.get(h.symbol) ?? null }));
    // 야후에 없고 네이버에만 있는 미국 종목도 추가
    for (const h of ko) {
      if (!results.some((r) => r.symbol === h.symbol)) {
        results.push({ symbol: h.symbol, name: h.nameKo, nameKo: h.nameKo, exchange: h.exchange, type: "" });
      }
    }
    return Response.json({ results: results.slice(0, 10) });
  } catch (e) {
    return Response.json({ results: [], error: (e as Error).message }, { status: 502 });
  }
}
