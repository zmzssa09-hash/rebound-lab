// 전략 규칙을 코드로 옮긴 분석 엔진.
// 원칙: RSI는 타이밍 보조 지표일 뿐. 과매도는 반등의 충분조건이 아니다.
import type { Bar, ChartData, QuoteSummary, Signal, Snapshot, Trend, Verdict, Zone } from "./types";
import { adx, atr, last, macd, rsi, sma } from "./indicators";

export const RSI_OVERSOLD = 30;
export const RSI_WEAK = 40;
export const RSI_OVERBOUGHT = 70;

export function computeSnapshot(bars: Bar[], livePrice?: number, prevClose?: number | null): Snapshot {
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);
  const price = livePrice ?? closes[closes.length - 1];

  const r = rsi(closes, 14);
  const m = macd(closes);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const s200 = sma(closes, 200);
  const v20 = sma(vols, 20);

  const sma50 = last(s50);
  const sma50Prev = last(s50, 10);
  const sma200 = last(s200);

  let trend: Trend = "unknown";
  if (sma50 != null && sma200 != null) {
    // 가격이 50일·200일선 모두 아래면 하락 추세 (급락으로 이평선 역배열 전인 경우 포함)
    if (price < sma50 && price < sma200) trend = "down";
    else if (price > sma50 && sma50 > sma200) trend = "up";
    else trend = "mixed";
  } else if (sma50 != null && sma50Prev != null) {
    trend = price < sma50 && sma50 < sma50Prev ? "down" : price > sma50 && sma50 > sma50Prev ? "up" : "mixed";
  }

  // 최근 10거래일 내 MACD 히스토그램 양전환
  let macdCrossDaysAgo: number | null = null;
  for (let k = 0; k < 10; k++) {
    const h = last(m.hist, k);
    const hp = last(m.hist, k + 1);
    if (h != null && hp != null && h > 0 && hp <= 0) {
      macdCrossDaysAgo = k;
      break;
    }
  }

  // 최근 5일 중 하락일의 평균 거래량 / 20일 평균 거래량
  const vol20 = last(v20);
  let downDayVolRatio: number | null = null;
  if (vol20 && bars.length > 6) {
    const recent = bars.slice(-5);
    const downs = recent.filter((b, i) => {
      const prev = i === 0 ? bars[bars.length - 6].close : recent[i - 1].close;
      return b.close < prev;
    });
    if (downs.length > 0) {
      downDayVolRatio = downs.reduce((a, b) => a + b.volume, 0) / downs.length / vol20;
    } else {
      downDayVolRatio = 0;
    }
  }

  const last63 = bars.slice(-63);
  const low3m = last63.length ? Math.min(...last63.map((b) => b.low)) : null;
  const prior = bars.slice(-63, -5);
  const priorLow3m = prior.length ? Math.min(...prior.map((b) => b.low)) : null;
  const last252 = bars.slice(-252);
  const high52 = last252.length ? Math.max(...last252.map((b) => b.high)) : null;
  const low52 = last252.length ? Math.min(...last252.map((b) => b.low)) : null;

  const pc = prevClose ?? closes[closes.length - 2] ?? null;

  // ADX·ATR: 고가·저가가 있는 일봉에서만 의미가 있음
  const hasHL = bars.slice(-30).some((b) => b.high !== b.low);
  const ax = hasHL ? adx(bars) : null;
  const at = hasHL ? last(atr(bars)) : null;

  return {
    price,
    changePct: pc ? ((price - pc) / pc) * 100 : null,
    rsi: last(r),
    rsiPrev: last(r, 5),
    macd: last(m.macd),
    macdSignal: last(m.signal),
    macdHist: last(m.hist),
    macdHistPrev: last(m.hist, 3),
    macdCrossDaysAgo,
    sma20: last(s20),
    sma50,
    sma200,
    sma50Rising: sma50 != null && sma50Prev != null ? sma50 > sma50Prev : null,
    trend,
    vol20,
    downDayVolRatio,
    low3m,
    priorLow3m,
    high52,
    low52,
    drawdown52: high52 ? ((price - high52) / high52) * 100 : null,
    adx: ax ? last(ax.adx) : null,
    adxPrev: ax ? last(ax.adx, 5) : null,
    plusDI: ax ? last(ax.plusDI) : null,
    minusDI: ax ? last(ax.minusDI) : null,
    atr: at,
  };
}

const fmt = (n: number | null | undefined, d = 2) => (n == null ? "–" : n.toFixed(d));

export function rsiLabel(v: number | null): { text: string; tone: Signal["tone"] } {
  if (v == null) return { text: "데이터 부족", tone: "neutral" };
  if (v <= RSI_OVERSOLD) return { text: "과매도", tone: "good" };
  if (v < RSI_WEAK) return { text: "약세권", tone: "neutral" };
  if (v < 60) return { text: "중립", tone: "neutral" };
  if (v < RSI_OVERBOUGHT) return { text: "강세권", tone: "neutral" };
  return { text: "과매수", tone: "warn" };
}

export const TREND_LABEL: Record<Trend, string> = {
  up: "상승 추세",
  down: "하락 추세",
  mixed: "혼조",
  unknown: "판단 불가",
};

export function buildSignals(s: Snapshot): Signal[] {
  const out: Signal[] = [];

  // 1. RSI
  const rl = rsiLabel(s.rsi);
  out.push({
    key: "rsi",
    label: "RSI(14)",
    value: `${fmt(s.rsi, 1)} · ${rl.text}`,
    tone: s.rsi != null && s.rsi <= RSI_OVERSOLD ? "warn" : "neutral",
    detail:
      s.rsi == null
        ? "RSI 계산에 필요한 데이터가 부족합니다."
        : s.rsi <= RSI_OVERSOLD
          ? `과매도 구간입니다. 단, 과매도는 반등의 충분조건이 아닙니다. 5거래일 전 ${fmt(s.rsiPrev, 1)} → 현재 ${fmt(s.rsi, 1)}.`
          : s.rsi < RSI_WEAK
            ? `약세권이지만 과매도(≤${RSI_OVERSOLD})는 아닙니다. 과매도 후보로 분류하지 않습니다.`
            : `과매도 구간이 아닙니다. 이 전략의 진입 대상이 아닙니다.`,
  });

  // 2. 추세
  out.push({
    key: "trend",
    label: "추세 (이동평균)",
    value: TREND_LABEL[s.trend],
    tone: s.trend === "down" ? "bad" : s.trend === "up" ? "good" : "neutral",
    detail:
      `현재가 ${fmt(s.price)} / 50일선 ${fmt(s.sma50)} / 200일선 ${fmt(s.sma200)}. ` +
      (s.trend === "down"
        ? "가격이 50일·200일 이동평균 아래에 있는 하락 추세입니다. 과매도가 더 깊어질 수 있습니다."
        : s.trend === "up"
          ? "상승 추세 안에서의 눌림인지 확인할 수 있습니다."
          : "추세가 뚜렷하지 않습니다."),
  });

  // 3. MACD
  let macdTone: Signal["tone"] = "neutral";
  let macdValue = "–";
  let macdDetail = "MACD 계산에 필요한 데이터가 부족합니다.";
  if (s.macdHist != null) {
    const improving = s.macdHistPrev != null && s.macdHist > s.macdHistPrev;
    if (s.macdCrossDaysAgo != null) {
      macdTone = "good";
      macdValue = `양전환 (${s.macdCrossDaysAgo === 0 ? "오늘" : `${s.macdCrossDaysAgo}일 전`})`;
      macdDetail = "MACD가 시그널선을 상향 돌파했습니다. 하락 모멘텀이 약해지는 신호일 수 있습니다.";
    } else if (s.macdHist < 0 && improving) {
      macdTone = "warn";
      macdValue = "음수 · 개선 중";
      macdDetail = "히스토그램은 음수지만 3거래일 전보다 개선되고 있습니다. 아직 확인 신호는 아닙니다.";
    } else if (s.macdHist < 0) {
      macdTone = "bad";
      macdValue = "음수 · 악화";
      macdDetail = "하락 모멘텀이 강해지고 있습니다. 과매도만 보고 진입하기 이른 상태입니다.";
    } else {
      macdTone = improving ? "good" : "neutral";
      macdValue = improving ? "양수 · 확대" : "양수 · 둔화";
      macdDetail = "MACD가 시그널선 위에 있습니다.";
    }
  }
  out.push({ key: "macd", label: "MACD (12,26,9)", value: macdValue, tone: macdTone, detail: macdDetail });

  // 4. 거래량
  let volTone: Signal["tone"] = "neutral";
  let volValue = "–";
  let volDetail = "거래량 데이터가 부족합니다.";
  if (s.downDayVolRatio != null) {
    if (s.downDayVolRatio === 0) {
      volTone = "good";
      volValue = "최근 5일 하락일 없음";
      volDetail = "최근 5거래일 동안 하락 마감한 날이 없습니다.";
    } else {
      volValue = `하락일 거래량 ${fmt(s.downDayVolRatio * 100, 0)}%`;
      if (s.downDayVolRatio >= 1.3) {
        volTone = "bad";
        volDetail = "하락한 날의 거래량이 20일 평균보다 크게 많습니다. 매도 압력이 계속되고 있습니다.";
      } else if (s.downDayVolRatio <= 0.9) {
        volTone = "good";
        volDetail = "하락한 날의 거래량이 20일 평균보다 적습니다. 매도세가 진정되는 모습일 수 있습니다.";
      } else {
        volDetail = "하락일 거래량이 평균 수준입니다.";
      }
    }
  }
  out.push({ key: "volume", label: "거래량", value: volValue, tone: volTone, detail: volDetail });

  // 5. 지지선
  let supTone: Signal["tone"] = "neutral";
  let supValue = "–";
  let supDetail = "데이터가 부족합니다.";
  if (s.priorLow3m != null && s.low3m != null) {
    const dist = ((s.price - s.priorLow3m) / s.priorLow3m) * 100;
    if (s.low3m < s.priorLow3m) {
      supTone = "bad";
      supValue = "직전 저점 이탈";
      supDetail = `최근 5일 사이 3개월 저점(${fmt(s.priorLow3m)})을 깼습니다. 새 지지선이 확인될 때까지 기다리는 편이 안전합니다.`;
    } else if (dist <= 5) {
      supTone = "warn";
      supValue = `저점 위 ${fmt(dist, 1)}%`;
      supDetail = `3개월 저점 ${fmt(s.priorLow3m)} 부근입니다. 지지 여부를 확인할 구간입니다.`;
    } else {
      supValue = `저점 위 ${fmt(dist, 1)}%`;
      supDetail = `3개월 저점 ${fmt(s.priorLow3m)}에서 떨어져 있습니다.`;
    }
  }
  out.push({ key: "support", label: "지지선 (3개월 저점)", value: supValue, tone: supTone, detail: supDetail });

  return out;
}

/** 기술적 판정. 매수 추천이 아니라 "다음에 무엇을 확인할지"를 알려준다. */
export function buildVerdict(s: Snapshot): Verdict {
  if (s.rsi == null) {
    return { title: "데이터 부족", tone: "neutral", summary: "지표를 계산할 만큼 가격 기록이 충분하지 않습니다." };
  }
  const macdImproving =
    s.macdCrossDaysAgo != null || (s.macdHist != null && s.macdHistPrev != null && s.macdHist > s.macdHistPrev);
  const volCalming = s.downDayVolRatio != null && s.downDayVolRatio <= 0.9;
  const supportHeld = s.low3m != null && s.priorLow3m != null && s.low3m >= s.priorLow3m;
  const stabilizers = [macdImproving, volCalming, supportHeld].filter(Boolean).length;

  if (s.rsi <= RSI_OVERSOLD) {
    if (s.trend === "down" && stabilizers === 0) {
      return {
        title: "과매도 · 하락 진행 중 — 관찰",
        tone: "bad",
        summary: "RSI는 과매도지만 추세·모멘텀·거래량 모두 아직 하락 쪽입니다. 하락이 멈췄다는 확인 신호가 없습니다.",
      };
    }
    if (stabilizers >= 2) {
      return {
        title: "과매도 · 안정 신호 확인 — 반등 후보",
        tone: "good",
        summary: `안정 신호 ${stabilizers}/3개(MACD 개선·매도 거래량 진정·저점 유지)가 보입니다. 매수 전 이중 투자전략 평가로 장기 보유 기준과 철회 조건을 먼저 확인하세요.`,
      };
    }
    return {
      title: "과매도 · 추가 확인 필요",
      tone: "warn",
      summary: `안정 신호 ${stabilizers}/3개. 과매도만으로 매수하지 않는다는 원칙에 따라 MACD·거래량·지지선 확인을 더 기다립니다.`,
    };
  }
  if (s.rsi < RSI_WEAK) {
    return {
      title: "약세권 · 과매도 아님",
      tone: "neutral",
      summary: `RSI ${s.rsi.toFixed(1)}는 과매도(≤${RSI_OVERSOLD})가 아닙니다. 과매도 후보로 분류하지 않습니다.`,
    };
  }
  if (s.rsi >= RSI_OVERBOUGHT) {
    return {
      title: "과매수 구간",
      tone: "warn",
      summary: "이 전략의 진입 구간이 아닙니다. 보유 중이라면 목표가·분할 매도 계획을 점검할 시점입니다.",
    };
  }
  return {
    title: "전략 대상 아님",
    tone: "neutral",
    summary: `RSI ${s.rsi.toFixed(1)}로 과매도 구간이 아닙니다.`,
  };
}

/** 현재가와 관심 가격대의 관계 */
export function zoneStatus(price: number | null, z: Zone): { text: string; tone: "warn" | "neutral" | "bad" } {
  if (price == null) return { text: "", tone: "neutral" };
  if (price >= z.low && price <= z.high) return { text: "현재 구간", tone: "warn" };
  if (price > z.high) return { text: `${(((price - z.high) / price) * 100).toFixed(1)}% 위`, tone: "neutral" };
  return { text: `구간 아래 ${(((z.low - price) / z.low) * 100).toFixed(1)}%`, tone: "bad" };
}

export function summarize(data: ChartData): QuoteSummary {
  const s = computeSnapshot(data.bars, data.meta.price, data.meta.previousClose);
  return {
    symbol: data.meta.symbol,
    name: data.meta.name,
    currency: data.meta.currency,
    instrumentType: data.meta.instrumentType,
    price: s.price,
    changePct: s.changePct,
    rsi: s.rsi,
    trend: s.trend,
    macdHist: s.macdHist,
    macdImproving:
      s.macdHist != null && s.macdHistPrev != null ? s.macdHist > s.macdHistPrev : null,
    verdict: buildVerdict(s),
    marketTime: data.meta.marketTime,
  };
}
