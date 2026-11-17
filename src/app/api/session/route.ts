import { computeSnapshot } from "@/lib/analysis";
import { getSession, nextRegularOpen } from "@/lib/marketClock";
import { fetchChart } from "@/lib/yahoo";

/** 시장 국면: S&P 500(SPY)이 200일선 위인지 */
async function regime() {
  try {
    const c = await fetchChart("SPY", "2y");
    const s = computeSnapshot(c.bars, c.meta.price);
    if (s.sma200 == null) return null;
    return {
      spy: s.price,
      sma200: s.sma200,
      sma50: s.sma50,
      above200: s.price > s.sma200,
      above50: s.sma50 != null ? s.price > s.sma50 : null,
      gap200: ((s.price - s.sma200) / s.sma200) * 100,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const now = Date.now();
  const [s, reg] = await Promise.all([getSession(now), regime()]);
  const open = s.state === "regular" ? null : nextRegularOpen(s, now);
  return Response.json({
    state: s.state,
    regularEnd: s.regularEnd,
    nextOpenAt: open?.at ?? null,
    nextOpenExact: open?.exact ?? false,
    regime: reg,
    serverTime: now,
  });
}
