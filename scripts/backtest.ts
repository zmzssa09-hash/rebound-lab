// 과거 검증(백테스트) 실행 → .data/backtest.json
//   npx tsx scripts/backtest.ts [종목 수=500]
// 대상: 최근 분석(scan.json)에서 거래대금 상위 미국 주식 (ETF 제외, 주가 $5 이상)
// GitHub Actions가 매달 1회 실행하고(data 브랜치에 저장), 수동 실행도 가능하다.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { simulatePortfolio, simulateSymbol, spyIndex, tradeStats, type BtTrade, type SimOptions } from "../src/lib/backtest";
import type { Bar } from "../src/lib/types";
import { fetchChart } from "../src/lib/yahoo";

const N = Number(process.argv[2]) || 500;
const DATA = path.join(process.cwd(), ".data");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Row {
  symbol: string;
  price: number;
  etf?: boolean;
  dollarVolume?: number | null;
}

async function main() {
  const started = Date.now();
  const scan = JSON.parse(await readFile(path.join(DATA, "scan.json"), "utf8")) as { rows: Row[] };
  const universe = scan.rows
    .filter((r) => !r.etf && r.price >= 5 && (r.dollarVolume ?? 0) > 0 && /^[A-Z][A-Z-]{0,5}$/.test(r.symbol))
    .sort((a, b) => (b.dollarVolume ?? 0) - (a.dollarVolume ?? 0))
    .slice(0, N)
    .map((r) => r.symbol);
  console.log(`대상 ${universe.length}종목 (거래대금 상위)`);

  const spyBars = (await fetchChart("SPY", "10y")).bars;
  const spy = spyIndex(spyBars);
  const closeMap = new Map<string, Map<number, number>>();
  const trades: BtTrade[] = [];
  // 규칙 비교: 손절 방식·보유 기간을 바꿔 같은 신호로 다시 계산
  const ALT: { key: string; label: string; opts: SimOptions }[] = [
    { key: "wide60", label: "넓은 손절(ATR 2.5배, −10~−20%) + 목표가, 최대 60일", opts: { stop: "wide", maxHold: 60 } },
    { key: "wide20", label: "넓은 손절 + 목표가, 최대 20일", opts: { stop: "wide", maxHold: 20 } },
    { key: "none20", label: "손절 없이 목표가, 최대 20일", opts: { stop: "none", maxHold: 20 } },
  ];
  const alt: Record<string, BtTrade[]> = Object.fromEntries(ALT.map((a) => [a.key, [] as BtTrade[]]));
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < universe.length) {
      const sym = universe[next++];
      try {
        const bars: Bar[] = (await fetchChart(sym, "10y")).bars;
        closeMap.set(sym, new Map(bars.map((b) => [Math.floor(b.time / 86400), b.close])));
        trades.push(...simulateSymbol(sym, bars, spy));
        for (const a of ALT) alt[a.key].push(...simulateSymbol(sym, bars, spy, a.opts));
      } catch {
        /* 건너뜀 */
      }
      done++;
      if (done % 50 === 0) console.log(`[${Math.round((Date.now() - started) / 1000)}s] ${done}/${universe.length}, 매매 ${trades.length}건`);
      await sleep(120);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  trades.sort((a, b) => a.entryT - b.entryT);
  console.log(`매매 ${trades.length}건 시뮬레이션 완료`);

  const closeOf = (s: string, t: number) => closeMap.get(s)?.get(Math.floor(t / 86400)) ?? null;
  const noBear = trades.filter((t) => !t.bear);
  const year = (t: BtTrade) => new Date(t.entryT * 1000).getUTCFullYear();
  const years = [...new Set(trades.map(year))].sort();
  const bucket = <K extends string>(label: string, defs: { key: K; label: string; f: (t: BtTrade) => boolean }[]) => ({
    label,
    rows: defs.map((d) => ({ key: d.key, label: d.label, stats: tradeStats(trades.filter(d.f)) })),
  });

  const result = {
    generatedAt: Date.now(),
    universe: universe.length,
    from: trades[0]?.entryT ?? null,
    to: trades[trades.length - 1]?.entryT ?? null,
    variants: [
      { key: "site", label: "사이트 규칙 (목표가·손절가)", stats: tradeStats(trades) },
      { key: "site-nobear", label: "사이트 규칙 + 약세장엔 사지 않기", stats: tradeStats(noBear) },
      { key: "hold20", label: "비교: 과매도에 사서 20일 그냥 보유", stats: tradeStats(trades, (t) => t.hold20) },
      ...ALT.map((a) => ({ key: a.key, label: a.label, stats: tradeStats(alt[a.key]) })),
    ],
    portfolio: {
      site: simulatePortfolio(trades, closeOf, spyBars, { skipBear: false }),
      noBear: simulatePortfolio(trades, closeOf, spyBars, { skipBear: true }),
      ...Object.fromEntries(ALT.map((a) => [a.key, simulatePortfolio(alt[a.key], closeOf, spyBars, { skipBear: false })])),
    },
    byYear: years.map((y) => ({ year: y, stats: tradeStats(trades.filter((t) => year(t) === y)) })),
    buckets: [
      bucket("기술적 분석 점수별", [
        { key: "lo", label: "0~5점", f: (t) => t.tech <= 5 },
        { key: "mid", label: "6~9점", f: (t) => t.tech >= 6 && t.tech <= 9 },
        { key: "hi", label: "10점 이상", f: (t) => t.tech >= 10 },
      ]),
      bucket("손익비별", [
        { key: "a", label: "1~1.5", f: (t) => t.rr < 1.5 },
        { key: "b", label: "1.5~2", f: (t) => t.rr >= 1.5 && t.rr < 2 },
        { key: "c", label: "2~3", f: (t) => t.rr >= 2 && t.rr < 3 },
        { key: "d", label: "3 이상", f: (t) => t.rr >= 3 },
      ]),
      bucket("시장 국면별", [
        { key: "bull", label: "S&P 500이 200일선 위", f: (t) => !t.bear },
        { key: "bear", label: "S&P 500이 200일선 아래 (약세장)", f: (t) => t.bear },
      ]),
    ],
    seconds: Math.round((Date.now() - started) / 1000),
  };
  await mkdir(DATA, { recursive: true });
  await writeFile(path.join(DATA, "backtest.json"), JSON.stringify(result));
  const s = result.variants[0].stats;
  const p = result.portfolio.site;
  console.log(
    `완료 ${result.seconds}초 · 거래당 평균 ${s.avg?.toFixed(2)}% (승률 ${((s.winRate ?? 0) * 100).toFixed(0)}%) · 포트폴리오 연 ${p.cagr?.toFixed(1)}% (S&P ${p.spyCagr?.toFixed(1)}%) · MDD ${p.mdd.toFixed(1)}%`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("백테스트 실패:", e);
    process.exit(1);
  });
