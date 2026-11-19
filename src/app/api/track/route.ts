import { getFilterStats } from "@/lib/filterTrack";
import { getTrack, trackStats } from "@/lib/track";

export async function GET() {
  const [t, filter] = await Promise.all([getTrack(), getFilterStats()]);
  return Response.json({ updatedAt: t.updatedAt, startedAt: t.startedAt ?? null, stats: trackStats(t.records), records: t.records, filter });
}
