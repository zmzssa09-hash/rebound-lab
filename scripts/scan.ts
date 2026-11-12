// 전 종목 분석 1회 실행 → .data/ 에 scan.json, history.json 저장
// GitHub Actions가 1시간마다 실행한다 (.github/workflows/hourly-scan.yml)
import { runScanOnce } from "../src/lib/scanner";

const started = Date.now();
runScanOnce((s) => console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${s.phase} ${s.done}/${s.total}`))
  .then(async () => {
    const { getResult } = await import("../src/lib/scanner");
    const r = await getResult();
    console.log(`완료: ${Math.round((Date.now() - started) / 1000)}초, 종목 ${r?.rows.length}개, 후보 ${r?.picks?.length}개, Top ${r?.top?.length}개`);
    if (!r?.top?.length) console.warn("경고: Top 10이 비어 있습니다.");
    process.exit(0);
  })
  .catch((e) => {
    console.error("분석 실패:", e);
    process.exit(1);
  });
