import { buildInsight } from "@/lib/insight";
import { fetchChart, YahooError } from "@/lib/yahoo";

export async function GET(request: Request) {
  const symbol = new URL(request.url).searchParams.get("symbol") ?? "";
  try {
    const chart = await fetchChart(symbol, "2y");
    return Response.json(await buildInsight(symbol, chart));
  } catch (e) {
    const status = e instanceof YahooError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
