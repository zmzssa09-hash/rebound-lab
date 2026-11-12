// 서버 전용: 장 시간에 맞춘 전 종목 재분석 (로컬 실행용)
// 정규장 중 30분마다 + 마감 직후 확정 분석 1회 (규칙은 marketClock.ts)
// 배포(Vercel) 환경에서는 GitHub Actions가 분석하므로 여기서는 화면 표시용 정보만 계산한다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { decideScan, getSession, isStale, nextScanTime, type SessionState } from "./marketClock";
import { getResult, getStatus, REMOTE_DATA, startScan } from "./scanner";

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
  const d = decideScan(await getSession(), await lastScanAt());
  if (d.run && (await acquireLock())) startScan();
}

export function ensureScheduler() {
  if (!LOCAL_SCHEDULER || g.__sched) return;
  g.__sched = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 5_000);
}

export interface ScanSchedule {
  session: SessionState;
  marketOpen: boolean;
  nextScanAt: number | null; // null이면 다음 정규장 개장 후
  stale: boolean; // 장중인데 75분 넘게 갱신 없음
}

/** 화면 표시용 분석 일정 */
export async function scanSchedule(): Promise<ScanSchedule> {
  const [session, last] = await Promise.all([getSession(), lastScanAt()]);
  return {
    session: session.state,
    marketOpen: session.state === "regular",
    nextScanAt: nextScanTime(session, last),
    stale: isStale(session, last),
  };
}
