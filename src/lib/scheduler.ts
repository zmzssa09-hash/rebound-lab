// 서버 전용: 1시간마다 전 종목 재분석 (로컬 실행용)
// 배포(Vercel) 환경에서는 GitHub Actions가 분석하므로 여기서는 아무것도 하지 않는다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getResult, getStatus, REMOTE_DATA, STALE_MS, startScan } from "./scanner";

const SCAN_FILE = path.join(process.cwd(), ".data", "scan.json");
const LOCK_FILE = path.join(process.cwd(), ".data", "scan.lock");
const g = globalThis as unknown as { __sched?: ReturnType<typeof setInterval> };

/** 이 서버가 직접 분석을 돌리는지 */
export const LOCAL_SCHEDULER = !REMOTE_DATA && !process.env.VERCEL;

async function lastScanAt(): Promise<number> {
  if (!LOCAL_SCHEDULER) return (await getResult())?.scannedAt ?? 0;
  try {
    // 큰 파일 전체를 파싱하지 않고 앞부분의 scannedAt만 읽음
    const head = (await readFile(SCAN_FILE, "utf8")).slice(0, 200);
    const m = head.match(/"scannedAt":(\d+)/);
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

/** 다른 프로세스가 스캔 중이면(15분 이내 잠금) 건너뜀 */
async function acquireLock(): Promise<boolean> {
  try {
    const t = Number(await readFile(LOCK_FILE, "utf8"));
    if (Date.now() - t < 15 * 60 * 1000) return false;
  } catch {
    /* 잠금 없음 */
  }
  await mkdir(path.dirname(LOCK_FILE), { recursive: true });
  await writeFile(LOCK_FILE, String(Date.now()));
  return true;
}

async function tick() {
  if (getStatus().state === "running") return;
  const last = await lastScanAt();
  if (Date.now() - last < STALE_MS) return;
  if (await acquireLock()) startScan();
}

export function ensureScheduler() {
  if (!LOCAL_SCHEDULER || g.__sched) return;
  g.__sched = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 5_000);
}

/** GitHub Actions 예약 시각: 매시 7분 (.github/workflows/hourly-scan.yml 의 cron 과 맞출 것) */
const CRON_MINUTE = 7;

export async function nextScanAt(): Promise<number | null> {
  if (!LOCAL_SCHEDULER) {
    const d = new Date();
    d.setUTCSeconds(0, 0);
    d.setUTCMinutes(CRON_MINUTE);
    if (d.getTime() <= Date.now()) d.setUTCHours(d.getUTCHours() + 1);
    return d.getTime(); // 실제 실행은 GitHub 사정으로 몇 분 늦어질 수 있음
  }
  const last = await lastScanAt();
  return last ? last + STALE_MS : null;
}
