// 서버 전용: 미국 시장 흐름 (지수·업종·변동성·시장 폭)
// 서버에서만 사용 (instrumentation 스케줄러에서도 불러오므로 server-only 표시는 쓰지 않음)
import { computeSnapshot } from "./analysis";
import { periodReturn } from "./dropReason";
import { getResult } from "./scanner";
import type { Tone } from "./types";
import { fetchChart } from "./yahoo";

export interface MarketItem {
  symbol: string;
  label: string;
  price: number;
  chg1d: number | null;
  chg1w: number | null;
  chg1m: number | null;
  chg3m: number | null;
  rsi: number | null;
  above50: boolean | null;
  above200: boolean | null;
  spark: number[];
}

export interface Breadth {
  stocks: number;
  above50: number; // %
  above200: number;
  oversold: number;
  overbought: number;
  scannedAt: number;
}

export interface MarketData {
  indices: MarketItem[];
  sectors: MarketItem[];
  vixRatio: number | null;
  breadth: Breadth | null;
  regime: { title: string; tone: Tone; points: string[]; strategy: string };
  fetchedAt: number;
}

const INDICES: [string, string][] = [
  ["^GSPC", "S&P 500"],
  ["^IXIC", "나스닥 종합"],
  ["^DJI", "다우존스"],
  ["^RUT", "러셀 2000 (중소형주)"],
  ["^VIX", "VIX 변동성지수"],
  ["^TNX", "미국 10년물 금리"],
];

export const SECTORS: [string, string][] = [
  ["XLK", "기술"],
  ["XLC", "커뮤니케이션"],
  ["XLY", "경기소비재"],
  ["XLP", "필수소비재"],
  ["XLV", "헬스케어"],
  ["XLF", "금융"],
  ["XLI", "산업재"],
  ["XLE", "에너지"],
  ["XLB", "소재"],
  ["XLU", "유틸리티"],
  ["XLRE", "부동산"],
];

async function item(symbol: string, label: string): Promise<MarketItem | null> {
  try {
    const c = await fetchChart(symbol, "2y");
    const s = computeSnapshot(c.bars, c.meta.price, c.meta.previousClose);
    return {
      symbol,
      label,
      price: c.meta.price,
      chg1d: s.changePct,
      chg1w: periodReturn(c.bars, 5),
      chg1m: periodReturn(c.bars, 21),
      chg3m: periodReturn(c.bars, 63),
      rsi: s.rsi,
      above50: s.sma50 != null ? c.meta.price > s.sma50 : null,
      above200: s.sma200 != null ? c.meta.price > s.sma200 : null,
      spark: c.bars.slice(-63).map((b) => b.close),
    };
  } catch {
    return null;
  }
}

let cache: { at: number; data: MarketData } | null = null;

export async function getMarket(): Promise<MarketData> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data;
  const [idx, sec, vix3m, scan] = await Promise.all([
    Promise.all(INDICES.map(([s, l]) => item(s, l))),
    Promise.all(SECTORS.map(([s, l]) => item(s, l))),
    item("^VIX3M", "VIX 3개월"),
    getResult(),
  ]);
  const indices = idx.filter((x): x is MarketItem => !!x);
  const sectors = sec.filter((x): x is MarketItem => !!x).sort((a, b) => (b.chg1m ?? 0) - (a.chg1m ?? 0));
  const vix = indices.find((x) => x.symbol === "^VIX");
  const vixRatio = vix && vix3m ? vix.price / vix3m.price : null;

  let breadth: Breadth | null = null;
  const stocks = scan ? scan.rows.filter((r) => !r.etf && r.price >= 3 && r.above200 != null) : [];
  if (scan && stocks.length > 100) {
    const n = stocks.length || 1;
    breadth = {
      stocks: stocks.length,
      above50: (stocks.filter((r) => r.above50).length / n) * 100,
      above200: (stocks.filter((r) => r.above200).length / n) * 100,
      oversold: (stocks.filter((r) => r.rsi != null && r.rsi <= 30).length / n) * 100,
      overbought: (stocks.filter((r) => r.rsi != null && r.rsi >= 70).length / n) * 100,
      scannedAt: scan.scannedAt,
    };
  }

  const data: MarketData = { indices, sectors, vixRatio, breadth, regime: regimeOf(indices, sectors, vixRatio, breadth), fetchedAt: Date.now() };
  cache = { at: Date.now(), data };
  return data;
}

const p = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);

function regimeOf(indices: MarketItem[], sectors: MarketItem[], vixRatio: number | null, b: Breadth | null): MarketData["regime"] {
  const spx = indices.find((x) => x.symbol === "^GSPC");
  const vix = indices.find((x) => x.symbol === "^VIX");
  const points: string[] = [];
  let title = "판단 불가";
  let tone: Tone = "neutral";

  if (spx) {
    if (spx.above200 && spx.above50) {
      title = "상승 추세";
      tone = "good";
    } else if (spx.above200 && !spx.above50) {
      title = "상승 추세 속 조정";
      tone = "warn";
    } else if (!spx.above200 && spx.above50) {
      title = "하락 후 반등 시도";
      tone = "warn";
    } else {
      title = "하락 추세";
      tone = "bad";
    }
    points.push(
      `S&P 500은 ${spx.above200 ? "200일선 위" : "200일선 아래"}, ${spx.above50 ? "50일선 위" : "50일선 아래"}에 있습니다 (1개월 ${p(spx.chg1m)}, 3개월 ${p(spx.chg3m)}).`,
    );
  }
  if (vix) {
    const lvl = vix.price < 15 ? "낮은 편(안정)" : vix.price < 20 ? "보통" : vix.price < 30 ? "높은 편(불안)" : "매우 높음(공포)";
    points.push(
      `VIX ${vix.price.toFixed(1)} — ${lvl}.${vixRatio != null ? ` 기간 구조 ${vixRatio.toFixed(2)} (${vixRatio < 1 ? "콘탱고: 단기 불안이 크지 않음" : "백워데이션: 단기 공포가 큼"}).` : ""}`,
    );
  }
  if (b) {
    points.push(
      `시장 폭: 미국 주식 ${b.stocks.toLocaleString()}개 중 200일선 위 ${b.above200.toFixed(0)}%, 50일선 위 ${b.above50.toFixed(0)}%, RSI 30 이하 ${b.oversold.toFixed(1)}%.`,
    );
  }
  if (sectors.length >= 3) {
    const top = sectors.slice(0, 3).map((s) => `${s.label} ${p(s.chg1m)}`).join(", ");
    const bottom = sectors.slice(-3).reverse().map((s) => `${s.label} ${p(s.chg1m)}`).join(", ");
    points.push(`최근 1개월 강한 업종: ${top}. 약한 업종: ${bottom}.`);
  }

  let strategy: string;
  if (tone === "bad" || (vix && vix.price >= 30)) {
    strategy =
      "시장 전반이 약해 과매도 종목이 많아지고 반등도 약할 수 있습니다. 시장 탓으로 떨어진 우량주를 고르되, 분할 매수와 현금 비중을 넉넉히 가져가세요.";
  } else if (tone === "good") {
    strategy =
      "시장은 강한데 혼자 떨어진 종목은 개별 악재일 가능성이 큽니다. 하락 이유가 실적·성장 문제인지 반드시 확인하고, 일시적 악재만 골라내세요.";
  } else {
    strategy = "시장이 조정 중입니다. 시장과 함께 눌린 우량주는 반등 후보가 되기 쉽지만, 지지선과 MACD 개선을 확인한 뒤 들어가세요.";
  }
  return { title, tone, points, strategy };
}
