import { getFundamentals, SECTOR_KO } from "@/lib/fundamentals";

/** 종목별 업종 (한국어) — 업종 쏠림 경고용 */
export async function GET(request: Request) {
  const syms = Array.from(
    new Set(
      (new URL(request.url).searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, 40);
  const out: Record<string, string | null> = {};
  await Promise.all(
    syms.map(async (s) => {
      const f = await getFundamentals(s).catch(() => null);
      out[s] = f?.sector ? (SECTOR_KO[f.sector] ?? f.sector) : null;
    }),
  );
  return Response.json({ sectors: out });
}
