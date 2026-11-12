// 과거 회복탄력성: 이 종목이 과거 과매도(RSI ≤ 30)에 빠졌을 때 얼마나, 얼마나 빨리 회복했는가
import { rsi } from "./indicators";
import type { Bar } from "./types";

export interface Episode {
  time: number; // 과매도 진입일
  rsi: number;
  entry: number; // 진입일 종가
  ret5: number | null; // 1주 뒤 수익률 %
  ret20: number | null; // 4주 뒤
  ret60: number | null; // 3개월 뒤
  ret250: number | null; // 12개월 뒤
  maxDrawdown20: number | null; // 진입 후 4주 내 추가 최대 하락 %
  recoveryDays: number | null; // 하락 직전 고점(직전 20일 최고 종가) 회복까지 거래일 (250일 내 미회복이면 null)
}

export interface Resilience {
  episodes: Episode[]; // 최신순
  n: number;
  years: number; // 분석 기간 (년)
  recovered60: number | null; // 60거래일 내 회복 비율 (0~1)
  medianRecoveryDays: number | null;
  winRate20: number | null; // 4주 뒤 플러스 비율
  medianRet5: number | null;
  medianRet20: number | null;
  medianRet60: number | null;
  medianRet250: number | null;
  winRate250: number | null;
  score: number; // 0~10 (평가표)
  scoreParts: string[];
  summary: string;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const ret = (bars: Bar[], i: number, d: number) => (i + d < bars.length ? ((bars[i + d].close - bars[i].close) / bars[i].close) * 100 : null);

export function analyzeResilience(bars: Bar[]): Resilience {
  const closes = bars.map((b) => b.close);
  const r = rsi(closes, 14);
  const episodes: Episode[] = [];
  let armed = true; // RSI가 40 위로 올라가야 다음 사례로 인정
  let lastIdx = -999;
  // 최근 20거래일 안의 진입은 결과가 아직 없으므로 제외
  for (let i = 15; i < bars.length - 20; i++) {
    const v = r[i];
    if (v == null) continue;
    if (v > 40) armed = true;
    if (armed && v <= 30 && i - lastIdx >= 20) {
      armed = false;
      lastIdx = i;
      const preHigh = Math.max(...closes.slice(Math.max(0, i - 20), i));
      let recoveryDays: number | null = null;
      for (let k = i + 1; k < Math.min(bars.length, i + 251); k++) {
        if (closes[k] >= preHigh) {
          recoveryDays = k - i;
          break;
        }
      }
      const win = bars.slice(i + 1, i + 21);
      episodes.push({
        time: bars[i].time,
        rsi: v,
        entry: closes[i],
        ret5: ret(bars, i, 5),
        ret20: ret(bars, i, 20),
        ret60: ret(bars, i, 60),
        ret250: ret(bars, i, 250),
        maxDrawdown20: win.length ? ((Math.min(...win.map((b) => b.low)) - closes[i]) / closes[i]) * 100 : null,
        recoveryDays,
      });
    }
  }
  episodes.reverse();

  const n = episodes.length;
  const years = bars.length / 252;
  const vals = (k: keyof Episode) => episodes.map((e) => e[k]).filter((x): x is number => typeof x === "number");
  // 60거래일 이상 지난 사례만 회복 비율 계산에 사용
  const matured = episodes.filter((e) => e.ret60 != null);
  const recovered60 = matured.length ? matured.filter((e) => e.recoveryDays != null && e.recoveryDays <= 60).length / matured.length : null;
  const recDays = vals("recoveryDays");
  const r20 = vals("ret20");
  const r250 = vals("ret250");

  const res: Resilience = {
    episodes,
    n,
    years,
    recovered60,
    medianRecoveryDays: median(recDays),
    winRate20: r20.length ? r20.filter((x) => x > 0).length / r20.length : null,
    medianRet5: median(vals("ret5")),
    medianRet20: median(r20),
    medianRet60: median(vals("ret60")),
    medianRet250: median(r250),
    winRate250: r250.length ? r250.filter((x) => x > 0).length / r250.length : null,
    score: 5,
    scoreParts: [],
    summary: "",
  };

  // 평가표 점수 (10점): 회복 비율 4 + 회복 속도 3 + 4주 승률 3
  if (n < 2) {
    res.score = 5;
    res.scoreParts = [`과거 ${years.toFixed(0)}년간 과매도 사례 ${n}회 — 판단할 사례가 부족해 중립 5점`];
    res.summary = "과거 과매도 사례가 부족합니다.";
    return res;
  }
  let s = 0;
  const p: string[] = [];
  const rr = recovered60 ?? 0;
  const a = rr >= 0.7 ? 4 : rr >= 0.5 ? 3 : rr >= 0.3 ? 2 : rr > 0 ? 1 : 0;
  s += a;
  p.push(`60거래일 안에 하락 전 고점 회복 ${(rr * 100).toFixed(0)}% (${matured.length}회 중) → ${a}점`);
  const md = res.medianRecoveryDays;
  const b = md == null ? 0 : md <= 20 ? 3 : md <= 40 ? 2 : md <= 60 ? 1 : 0;
  s += b;
  p.push(md == null ? "회복한 사례 없음 → 0점" : `회복까지 걸린 기간 중앙값 ${md.toFixed(0)}거래일 (약 ${(md / 5).toFixed(0)}주) → ${b}점`);
  const w = res.winRate20 ?? 0;
  const c = w >= 0.6 ? 3 : w >= 0.5 ? 2 : w >= 0.4 ? 1 : 0;
  s += c;
  p.push(`과매도 4주 뒤 플러스 확률 ${(w * 100).toFixed(0)}%, 수익률 중앙값 ${res.medianRet20 != null ? `${res.medianRet20 > 0 ? "+" : ""}${res.medianRet20.toFixed(1)}%` : "–"} → ${c}점`);
  res.score = s;
  res.scoreParts = p;
  res.summary = `과거 ${years.toFixed(0)}년간 과매도 ${n}회 · 60일 내 회복 ${(rr * 100).toFixed(0)}% · 회복 중앙값 ${md != null ? `${md.toFixed(0)}거래일` : "–"} · 4주 수익 중앙값 ${res.medianRet20 != null ? `${res.medianRet20 > 0 ? "+" : ""}${res.medianRet20.toFixed(1)}%` : "–"}`;
  return res;
}
