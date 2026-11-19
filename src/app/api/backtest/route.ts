import { readDataFile } from "@/lib/dataFile";

export async function GET() {
  return Response.json({ result: await readDataFile("backtest.json", 30 * 60_000) });
}
