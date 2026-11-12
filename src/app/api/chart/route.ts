import { koreanName } from "@/lib/naver";
import { fetchChart, YahooError } from "@/lib/yahoo";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol") ?? "";
  try {
    const [data, nameKo] = await Promise.all([fetchChart(symbol, "2y"), koreanName(symbol).catch(() => null)]);
    return Response.json({ ...data, meta: { ...data.meta, nameKo } });
  } catch (e) {
    const status = e instanceof YahooError ? e.status : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
