import { readDataFile } from "@/lib/dataFile";
import type { WeeklyReport } from "@/lib/weekly";

export async function GET() {
  return Response.json({ reports: (await readDataFile<WeeklyReport[]>("weekly.json")) ?? [] });
}
