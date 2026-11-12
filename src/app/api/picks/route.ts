import { withLive } from "@/lib/live";
import { getResult, getStatus } from "@/lib/scanner";
import { ensureScheduler, scanSchedule } from "@/lib/scheduler";

export async function GET() {
  ensureScheduler();
  const [result, sched] = await Promise.all([getResult(), scanSchedule()]);
  const top = result?.top ? await withLive(result.top) : null;
  const topSet = new Set((result?.top ?? []).map((p) => p.symbol));
  return Response.json({
    status: getStatus(),
    scannedAt: result?.scannedAt ?? null,
    nextScanAt: sched.nextScanAt,
    marketOpen: sched.marketOpen,
    session: sched.session,
    stale: sched.stale,
    top,
    excluded: (result?.picks ?? []).filter((p) => p.excluded && !topSet.has(p.symbol)),
    exits: result?.exits ?? [],
    candidates: result?.picks?.length ?? 0,
    serverTime: Date.now(),
  });
}
