import { getPaper, PAPER_START_CASH, paperSummary } from "@/lib/paper";

export async function GET() {
  const p = await getPaper();
  if (!p) return Response.json({ paper: null, summary: null, startCash: PAPER_START_CASH });
  return Response.json({ paper: p, summary: paperSummary(p), startCash: PAPER_START_CASH });
}
