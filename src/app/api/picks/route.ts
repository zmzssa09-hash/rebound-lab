import { withLive } from "@/lib/live";
import { getResult, getStatus, isMarketOpen } from "@/lib/scanner";
import { ensureScheduler, nextScanAt } from "@/lib/scheduler";

export async function GET() {
  ensureScheduler();
  const result = await getResult();
  const top = result?.top ? await withLive(result.top) : null;
  const topSet = new Set((result?.top ?? []).map((p) => p.symbol));
  return Response.json({
    status: getStatus(),
    scannedAt: result?.scannedAt ?? null,
    nextScanAt: await nextScanAt(),
    marketOpen: isMarketOpen(),
    top,
    excluded: (result?.picks ?? []).filter((p) => p.excluded && !topSet.has(p.symbol)),
    exits: result?.exits ?? [],
    candidates: result?.picks?.length ?? 0,
    serverTime: Date.now(),
  });
}
