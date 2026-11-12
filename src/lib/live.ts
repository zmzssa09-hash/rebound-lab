// 서버 전용: Top 10에 실시간 가격을 입혀 가격 의존 점수(기술적 분석·저평가)를 다시 계산
import { computeSnapshot } from "./analysis";
import { technicalScore, valueScore } from "./scorecard";
import type { Pick } from "./types";
import { fetchChart } from "./yahoo";

export async function withLive(picks: Pick[]): Promise<Pick[]> {
  return Promise.all(
    picks.map(async (p) => {
      try {
        const c = await fetchChart(p.symbol, "2y"); // 서버 캐시 1분
        const snap = computeSnapshot(c.bars, c.meta.price, c.meta.previousClose);
        const tech = technicalScore(snap, p.plan?.supports ?? []).score;
        const val = valueScore(snap.price, p.fairValue, p.scenarios?.bear ?? null, p.confidence?.level ?? null).score;
        // 예전 형식 데이터(키가 discount)도 처리
        const oldVal = p.scores.value ?? p.scores.discount ?? 0;
        const total = p.total - (p.scores.technical ?? 0) - oldVal + tech + (val ?? 0);
        return { ...p, live: { price: snap.price, changePct: snap.changePct, rsi: snap.rsi, total, at: c.fetchedAt } };
      } catch {
        return p;
      }
    }),
  );
}
