// 서버 전용: Top 10에 실시간 가격을 입혀 가격 의존 점수(기술적 과매도·할인율)를 다시 계산
import { computeSnapshot } from "./analysis";
import { discountOf, discountScore, technicalScore } from "./scorecard";
import type { Pick } from "./types";
import { fetchChart } from "./yahoo";

export async function withLive(picks: Pick[]): Promise<Pick[]> {
  return Promise.all(
    picks.map(async (p) => {
      try {
        const c = await fetchChart(p.symbol, "2y"); // 서버 캐시 1분
        const snap = computeSnapshot(c.bars, c.meta.price, c.meta.previousClose);
        const tech = technicalScore(snap).score;
        const disc = discountScore(discountOf(snap.price, p.fairValue));
        const total = p.total - (p.scores.technical ?? 0) - (p.scores.discount ?? 0) + tech + (disc ?? 0);
        return { ...p, live: { price: snap.price, changePct: snap.changePct, rsi: snap.rsi, total, at: c.fetchedAt } };
      } catch {
        return p;
      }
    }),
  );
}
