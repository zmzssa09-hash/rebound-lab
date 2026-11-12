// 기술적 지표 계산 (순수 함수, 서버/클라이언트 공용)

export type Series = (number | null)[];

export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder 방식 RSI */
export function rsi(closes: number[], period = 14): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = toRsi(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = toRsi(avgGain, avgLoss);
  }
  return out;
}

function toRsi(avgGain: number, avgLoss: number) {
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export interface MacdResult {
  macd: Series;
  signal: Series;
  hist: Series;
}

export function macd(closes: number[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const ef = ema(closes, fast);
  const es = ema(closes, slow);
  const line: Series = closes.map((_, i) =>
    ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null,
  );
  const start = line.findIndex((v) => v != null);
  const signal: Series = new Array(closes.length).fill(null);
  if (start >= 0) {
    const compact = line.slice(start) as number[];
    const sig = ema(compact, signalPeriod);
    sig.forEach((v, j) => (signal[start + j] = v));
  }
  const hist: Series = line.map((v, i) =>
    v != null && signal[i] != null ? v - (signal[i] as number) : null,
  );
  return { macd: line, signal, hist };
}

export function last<T>(arr: (T | null)[], offset = 0): T | null {
  const v = arr[arr.length - 1 - offset];
  return v === undefined ? null : v;
}

interface HLC {
  high: number;
  low: number;
  close: number;
}

/** Wilder 방식 ATR (평균 실제 변동폭) */
export function atr(bars: HLC[], period = 14): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr = bars.map((b, i) =>
    i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close)),
  );
  let a = tr.slice(1, period + 1).reduce((x, y) => x + y, 0) / period;
  out[period] = a;
  for (let i = period + 1; i < bars.length; i++) {
    a = (a * (period - 1) + tr[i]) / period;
    out[i] = a;
  }
  return out;
}

/** Wilder 방식 ADX + 방향 지표(+DI, −DI). ADX가 높을수록 추세(상승이든 하락이든)가 강하다 */
export function adx(bars: HLC[], period = 14): { adx: Series; plusDI: Series; minusDI: Series } {
  const len = bars.length;
  const adxS: Series = new Array(len).fill(null);
  const pS: Series = new Array(len).fill(null);
  const mS: Series = new Array(len).fill(null);
  if (len <= period * 2) return { adx: adxS, plusDI: pS, minusDI: mS };
  let trS = 0, pdmS = 0, mdmS = 0;
  const dx: number[] = [];
  for (let i = 1; i < len; i++) {
    const b = bars[i], p = bars[i - 1];
    const up = b.high - p.high, down = p.low - b.low;
    const pdm = up > down && up > 0 ? up : 0;
    const mdm = down > up && down > 0 ? down : 0;
    const tr = Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close));
    if (i <= period) {
      trS += tr; pdmS += pdm; mdmS += mdm;
      if (i < period) continue;
    } else {
      trS = trS - trS / period + tr;
      pdmS = pdmS - pdmS / period + pdm;
      mdmS = mdmS - mdmS / period + mdm;
    }
    const pdi = trS ? (100 * pdmS) / trS : 0;
    const mdi = trS ? (100 * mdmS) / trS : 0;
    pS[i] = pdi;
    mS[i] = mdi;
    dx.push(pdi + mdi ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0);
    if (dx.length === period) adxS[i] = dx.reduce((x, y) => x + y, 0) / period;
    else if (dx.length > period) adxS[i] = ((adxS[i - 1] as number) * (period - 1) + dx[dx.length - 1]) / period;
  }
  return { adx: adxS, plusDI: pS, minusDI: mS };
}
