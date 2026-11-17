import { getTrack, trackStats } from "@/lib/track";

export async function GET() {
  const t = await getTrack();
  return Response.json({ updatedAt: t.updatedAt, startedAt: t.startedAt ?? null, stats: trackStats(t.records), records: t.records });
}
