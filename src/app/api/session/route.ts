import { getSession, nextRegularOpen } from "@/lib/marketClock";

export async function GET() {
  const now = Date.now();
  const s = await getSession(now);
  const open = s.state === "regular" ? null : nextRegularOpen(s, now);
  return Response.json({
    state: s.state,
    regularEnd: s.regularEnd,
    nextOpenAt: open?.at ?? null,
    nextOpenExact: open?.exact ?? false,
    serverTime: now,
  });
}
