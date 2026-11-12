// 서버 시작 시 1회 실행: 로컬에서 돌릴 때만 1시간 주기 분석 스케줄러 등록
// (Vercel 배포에서는 GitHub Actions가 매시간 분석한다)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL && !process.env.DATA_BASE_URL) {
    const { ensureScheduler } = await import("./lib/scheduler");
    ensureScheduler();
  }
}
