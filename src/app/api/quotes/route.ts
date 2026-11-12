import { summarize } from "@/lib/analysis";
import type { QuoteError, QuoteSummary } from "@/lib/types";
import { koreanName } from "@/lib/naver";
import { fetchChart } from "@/lib/yahoo";

const MAX = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbols = Array.from(
    new Set(
      (searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, MAX);

  const results = await Promise.all(
    symbols.map(async (sym): Promise<QuoteSummary | QuoteError> => {
      try {
        const [data, nameKo] = await Promise.all([fetchChart(sym, "2y"), koreanName(sym).catch(() => null)]);
        return { ...summarize(data), nameKo };
      } catch (e) {
        return { symbol: sym, error: (e as Error).message };
      }
    }),
  );
  return Response.json({ quotes: results, fetchedAt: Date.now() });
}
