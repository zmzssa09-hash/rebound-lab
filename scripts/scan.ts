// 전 종목 분석 → .data/ 에 scan.json, history.json 저장
// GitHub Actions가 평일 미국 장 시간대에 30분마다 실행한다 (.github/workflows/hourly-scan.yml)
//   npx tsx scripts/scan.ts          → 장 시간 규칙에 따라 필요할 때만 실행 (예약 실행용)
//   npx tsx scripts/scan.ts --force  → 무조건 실행 (수동 실행용)
import { appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { decideScan, getSession } from "../src/lib/marketClock";
import { buildDigest, sendPush } from "../src/lib/notify";
import { getResult, lastScanEvents, runScanOnce } from "../src/lib/scanner";

const force = process.argv.includes("--force");

/** GitHub Actions 다음 단계에 결과 전달 (ran=true 일 때만 data 브랜치에 올림) */
function setOutput(ran: boolean) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `ran=${ran}\n`);
}

async function lastScanAt(): Promise<number> {
  try {
    const head = (await readFile(path.join(process.cwd(), ".data", "scan.json"), "utf8")).slice(0, 200);
    return Number(head.match(/"scannedAt":(\d+)/)?.[1] ?? 0);
  } catch {
    return 0;
  }
}

async function main() {
  const session = await getSession();
  const last = await lastScanAt();
  const decision = force ? { run: true, reason: "수동 실행", kind: "close" as const } : decideScan(session, last);
  const fmt = (t: number | null) => (t ? new Date(t).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "–");
  console.log(`장 상태: ${session.state} (정규장 ${fmt(session.regularStart)} ~ ${fmt(session.regularEnd)}, 한국 시간)`);
  console.log(`마지막 분석: ${fmt(last)} → ${decision.run ? "실행" : "건너뜀"}: ${decision.reason}`);
  if (!decision.run) {
    setOutput(false);
    return;
  }

  const prevTop = (await getResult())?.top ?? []; // 알림용: 직전 Top 10
  const started = Date.now();
  await runScanOnce((s) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${s.phase} ${s.done}/${s.total}`));
  const r = await getResult();
  console.log(`완료: ${Math.round((Date.now() - started) / 1000)}초, 종목 ${r?.rows.length}개, 후보 ${r?.picks?.length}개, Top ${r?.top?.length}개`);

  // 비정상 결과는 올리지 않음 (이전 결과 유지)
  if (!r || !r.top?.length || r.rows.length < 3000) {
    console.error("결과가 비정상이라 이번 회차는 올리지 않습니다.");
    setOutput(false);
    process.exitCode = 1;
    return;
  }
  setOutput(true);

  // 휴대폰 푸시 알림 (GitHub Actions에서만: PUSH_ENABLED=1)
  const ev = lastScanEvents();
  const digest = buildDigest({ prevTop, top: r.top, newExits: ev.newExits, paperTrades: ev.paperTrades });
  if (!digest) console.log("알림: 새 소식 없음");
  else if (process.env.PUSH_ENABLED !== "1") console.log(`알림(로컬 실행이라 보내지 않음): ${digest.title}\n${digest.message}`);
  else {
    try {
      await sendPush(digest);
      console.log(`알림 보냄: ${digest.title}`);
    } catch (e) {
      console.error("알림 실패:", (e as Error).message);
    }
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error("분석 실패:", e);
    setOutput(false);
    process.exit(1);
  });
