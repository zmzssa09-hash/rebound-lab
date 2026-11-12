// 이중 투자전략 적정가 모델 1.1 (서버·클라이언트 공용 순수 함수)
//   DCF 현금흐름 가치        40%
//   동종업계 상대가치        30%
//   성장성 및 경쟁력         20%
//   재무·사업 위험 조정      10%
// 애널리스트 목표가·투자의견은 사용하지 않는다.
// 모든 주당가치는 완전희석주식수(스톡옵션·전환사채 등 포함)로 나눈다.
// 계산할 수 없는 항목(예: FCF 적자 기업의 DCF)은 빼고 나머지 비중으로 다시 나눈다.
// 같은 계산을 보수적·기준·낙관적 가정으로 세 번 돌려 시나리오별 적정가를 만든다.
import type { Fundamentals } from "./types";

export const MODEL_NAME = "이중 투자전략 적정가 모델 1.1";

export interface ValuationPart {
  key: "dcf" | "peer" | "growth" | "risk";
  label: string;
  weight: number; // 0.4 / 0.3 / 0.2 / 0.1
  value: number | null; // 주당 가치 ($)
  detail: string[];
}

export type ScenarioKey = "bear" | "base" | "bull";

export interface Scenario {
  key: ScenarioKey;
  label: string;
  growth: number; // 시작 성장률 (소수)
  rate: number | null; // 할인율
  multipleAdj: number; // 비교 배수 조정 (1 = 그대로)
  fairValue: number | null;
  marketCap: number | null; // 적정 시가총액
  upside: number | null; // 현재가 대비 %
}

export interface Confidence {
  level: "high" | "mid" | "low";
  label: string;
  reasons: string[];
}

export interface Valuation {
  fairValue: number | null;
  parts: ValuationPart[];
  usedWeight: number; // 실제 반영된 비중 합
  upside: number | null; // 현재가 대비 %
  riskMultiplier: number;
  notes: string[];
  shares: { basic: number | null; diluted: number | null; used: number | null; changeYoY: number | null };
  netCash: number | null;
  scenarios: Scenario[];
  confidence: Confidence;
}

/** 적정가 상한: 현재가 대비 +100% (반등 전략에서 현실적인 목표 범위). 낙관 시나리오는 +150% */
export const MAX_UPSIDE = 1.0;
const MAX_UPSIDE_BULL = 1.5;
/** 매출 성장률이 이보다 크면 일회성(라이선스 수익 등) 급증으로 본다 */
const SPIKE_GROWTH = 1.0;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const usd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}M` : `$${a.toFixed(2)}`;
  return v < 0 ? `-${s}` : s;
};
const d2 = (v: number) => `$${v.toFixed(2)}`;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 업종 기본 배수 — 비교 기업이 부족할 때만 사용하는 참고값 (EV/매출, EV/EBITDA, 선행 PER) */
const SECTOR_DEFAULT: Record<string, { evs: number; eve: number; pe: number }> = {
  Technology: { evs: 5, eve: 18, pe: 25 },
  "Communication Services": { evs: 3, eve: 11, pe: 18 },
  "Consumer Cyclical": { evs: 1.5, eve: 11, pe: 18 },
  "Consumer Defensive": { evs: 1.5, eve: 12, pe: 19 },
  Healthcare: { evs: 3.5, eve: 14, pe: 20 },
  "Financial Services": { evs: 3, eve: 10, pe: 13 },
  Industrials: { evs: 2, eve: 13, pe: 19 },
  Energy: { evs: 1.3, eve: 6, pe: 11 },
  "Basic Materials": { evs: 1.8, eve: 9, pe: 15 },
  Utilities: { evs: 3, eve: 11, pe: 17 },
  "Real Estate": { evs: 7, eve: 17, pe: 30 },
};

// ───────── 공용 판단 ─────────

/**
 * 이익 전망: 내년 예상 EPS ÷ 최근 12개월 EPS.
 *  - "collapse": 내년 예상 이익이 적자 → 최근 이익이 일회성일 가능성
 *  - "decline": 이익이 30% 이상 줄어들 전망
 */
export function earningsOutlook(f: Fundamentals): { kind: "ok" | "decline" | "collapse"; ratio: number | null } {
  const t = f.trailingEps,
    fw = f.forwardEps;
  if (t == null || fw == null || t <= 0) return { kind: "ok", ratio: null };
  if (fw <= 0) return { kind: "collapse", ratio: fw / t };
  const ratio = fw / t;
  return { kind: ratio < 0.7 ? "decline" : "ok", ratio };
}

/** 성장률 정규화: 일회성 급증은 성장으로 보지 않고, 이익 감소 전망이면 성장 가정을 낮춘다 */
function sustainableGrowth(f: Fundamentals): { g: number; note: string | null } {
  const rg = f.revenueGrowth ?? 0.03;
  const out = earningsOutlook(f);
  const confirmed = f.trailingEps != null && f.forwardEps != null && f.trailingEps > 0 && f.forwardEps / f.trailingEps >= 1.2;
  if (rg > SPIKE_GROWTH && confirmed) return { g: rg, note: `매출 성장률 ${pct(rg)} — 내년 이익도 늘 전망이라 실제 성장으로 보되 상한 적용` };
  if (rg > SPIKE_GROWTH) return { g: 0.05, note: `매출 성장률 ${pct(rg)}는 일회성 급증으로 보고 5%로 보수 적용` };
  if (out.kind !== "ok") return { g: Math.min(rg, 0.03), note: "이익 감소 전망이라 성장률을 3% 이하로 제한" };
  return { g: rg, note: null };
}

/** 완전희석주식수: 발행주식 수와 최근 분기 희석 평균 주식 수 중 큰 값 */
function dilutedShares(f: Fundamentals): number | null {
  const b = f.sharesOutstanding ?? null;
  const d = f.dilutedShares ?? null;
  if (b && d) return Math.max(b, d);
  return b ?? d;
}

/** 순현금 = 현금·단기투자 − 총차입금(리스 포함, 야후 집계 기준) */
function netCash(f: Fundamentals) {
  return (f.cash ?? 0) - (f.debt ?? 0);
}

interface Assumptions {
  key: ScenarioKey;
  growthMul: number; // 성장률 배수
  rateAdj: number; // 할인율 가감
  multAdj: number; // 비교 배수 배수
}

const SCENARIOS: (Assumptions & { label: string })[] = [
  { key: "bear", label: "보수적", growthMul: 0.5, rateAdj: 0.01, multAdj: 0.8 },
  { key: "base", label: "기준", growthMul: 1, rateAdj: 0, multAdj: 1 },
  { key: "bull", label: "낙관적", growthMul: 1.3, rateAdj: -0.01, multAdj: 1.2 },
];

// ───────── 1) DCF ─────────

function discountRate(f: Fundamentals, a: Assumptions) {
  const beta = clamp(f.beta ?? 1, 0.6, 2.5);
  return { beta, r: clamp(0.07 + beta * 0.025 + a.rateAdj, 0.07, 0.13) };
}

/** 시작 성장률 상한: 기본 15%, 내년 예상 이익이 20% 이상 늘 전망이면(성장 확인) 25% */
function growthCap(f: Fundamentals) {
  const confirmed = f.trailingEps != null && f.forwardEps != null && f.trailingEps > 0 && f.forwardEps / f.trailingEps >= 1.2;
  return confirmed ? 0.25 : 0.15;
}

function startGrowth(f: Fundamentals, a: Assumptions) {
  const sg = sustainableGrowth(f);
  const g = sg.g > 0 ? sg.g * a.growthMul : sg.g * (2 - a.growthMul);
  const cap = growthCap(f) * (a.key === "bull" ? 1.2 : 1);
  return { g0: clamp(g, -0.05, cap), note: sg.note };
}

function dcfValue(f: Fundamentals, fcfBase: number, g0: number, r: number, gT: number) {
  let cf = fcfBase;
  let pv = 0;
  for (let y = 1; y <= 10; y++) {
    // 1~5년: 시작 성장률 → 3%로 수렴, 6~10년: 3% → 영구성장률
    const g = y <= 5 ? g0 + ((0.03 - g0) * (y - 1)) / 4 : 0.03 + ((gT - 0.03) * (y - 5)) / 5;
    cf *= 1 + g;
    pv += cf / (1 + r) ** y;
  }
  const pvTv = (cf * (1 + gT)) / (r - gT) / (1 + r) ** 10;
  return { pv, pvTv, equity: pv + pvTv + netCash(f) };
}

function baseFcf(f: Fundamentals): number | null {
  const fcf = f.freeCashflow;
  if (fcf == null || fcf <= 0) return null;
  const out = earningsOutlook(f);
  if (out.kind === "collapse") return null;
  // 이익 감소 전망이면 기준 현금흐름을 예상 이익 비율만큼 낮춘다
  return out.kind === "decline" ? fcf * Math.max(out.ratio!, 0.2) : fcf;
}

function dcf(f: Fundamentals, shares: number | null, a: Assumptions): ValuationPart {
  const part: ValuationPart = { key: "dcf", label: "DCF 현금흐름 가치", weight: 0.4, value: null, detail: [] };
  const fcf = f.freeCashflow;
  if (!shares) {
    part.detail.push("발행주식 수 데이터 없음 — 계산 불가");
    return part;
  }
  if (fcf == null || fcf <= 0) {
    part.detail.push(`잉여현금흐름(FCF) ${fcf == null ? "확인 불가" : `${usd(fcf)} 적자`} — DCF 적용 불가, 나머지 항목으로 계산`);
    return part;
  }
  const out = earningsOutlook(f);
  if (out.kind === "collapse") {
    part.detail.push(
      `최근 12개월 EPS ${d2(f.trailingEps!)} → 내년 예상 EPS ${d2(f.forwardEps!)} (적자 전환 전망)`,
      "최근 현금흐름이 일회성일 가능성이 커서 DCF 적용 불가",
    );
    return part;
  }
  const fcfBase = baseFcf(f)!;
  const { g0, note } = startGrowth(f, a);
  const gT = 0.025;
  const { beta, r } = discountRate(f, a);
  const { pv, pvTv, equity } = dcfValue(f, fcfBase, g0, r, gT);
  part.detail.push(
    out.kind === "decline"
      ? `기준 FCF ${usd(fcfBase)} = 최근 12개월 ${usd(fcf)}(실제) × 예상 이익 비율 ${(out.ratio! * 100).toFixed(0)}% (내년 이익 감소 전망 반영)`
      : `기준 FCF ${usd(fcf)} (최근 12개월 실제)`,
    ...(note ? [note] : []),
    `성장률(추정): ${pct(g0)}(상한 ${pct(growthCap(f))}${growthCap(f) > 0.15 ? " — 내년 이익 20% 이상 증가 전망으로 성장 확인" : ""})에서 5년간 3%로 수렴 → 10년차 2.5% (영구성장, 미국 장기 명목성장률 수준)`,
    `할인율 ${pct(r)} = 기본 7% + 베타 ${beta.toFixed(2)} × 2.5%${a.rateAdj ? ` ${a.rateAdj > 0 ? "+" : "−"} ${pct(Math.abs(a.rateAdj))}(시나리오)` : ""}`,
    `현금흐름 현재가치 ${usd(pv)} + 잔존가치 현재가치 ${usd(pvTv)} + 순현금 ${usd(netCash(f))} = 주주가치 ${usd(equity)}`,
  );
  if (equity <= 0) {
    part.detail.push("순부채가 현금흐름 가치보다 커서 주주가치가 0 이하 — DCF 적용 불가");
    return part;
  }
  part.value = equity / shares;
  part.detail.push(`÷ 완전희석주식수 ${(shares / 1e6).toFixed(1)}M주 = ${d2(part.value)}`);
  return part;
}

export interface Sensitivity {
  rates: number[];
  terms: number[];
  grid: (number | null)[][];
}

/** DCF 민감도: 할인율 ±1%p × 영구성장률 2%·2.5%·3% (기준 시나리오) */
export function dcfSensitivity(f: Fundamentals | null): Sensitivity | null {
  if (!f || (f.financialCurrency && f.financialCurrency !== "USD") || isFinancialCo(f)) return null;
  const shares = dilutedShares(f);
  const fcfBase = baseFcf(f);
  if (!shares || fcfBase == null) return null;
  const base = SCENARIOS[1];
  const { r } = discountRate(f, base);
  const { g0 } = startGrowth(f, base);
  const rates = [r - 0.01, r, r + 0.01];
  const terms = [0.02, 0.025, 0.03];
  const grid = rates.map((rr) =>
    terms.map((gT) => {
      if (rr <= gT + 0.02) return null;
      const { equity } = dcfValue(f, fcfBase, g0, rr, gT);
      return equity > 0 ? equity / shares : null;
    }),
  );
  return { rates, terms, grid };
}

// ───────── 2) 동종업계 상대가치 ─────────

function peerValue(f: Fundamentals, peers: Fundamentals[], shares: number | null, a: Assumptions): ValuationPart {
  const part: ValuationPart = { key: "peer", label: "동종업계 상대가치", weight: 0.3, value: null, detail: [] };
  if (!shares) {
    part.detail.push("발행주식 수 데이터 없음 — 계산 불가");
    return part;
  }
  // 0~3배 같은 비정상 배수(적자·특수 상황 기업)는 제외
  const evs = median(peers.map((p) => p.evToRevenue).filter((v): v is number => v != null && v > 0 && v < 50));
  const eve = median(peers.map((p) => p.evToEbitda).filter((v): v is number => v != null && v >= 3 && v < 80));
  const pe = median(peers.map((p) => p.forwardPE).filter((v): v is number => v != null && v >= 5 && v < 100));
  const def = f.sector ? SECTOR_DEFAULT[f.sector] : undefined;
  const usePeers = peers.length >= 3;
  // 비교 기업 배수는 업종 기본값의 0.5~1.75배 범위로 제한 (고성장주 몇 곳에 끌려가지 않게)
  const bound = (v: number | null, d: number | undefined) => (v == null ? (d ?? null) : d ? clamp(v, d * 0.5, d * 1.75) : v);
  const adj = (v: number | null) => (v == null ? null : v * a.multAdj);
  const m = {
    evs: adj(usePeers ? bound(evs, def?.evs) : (def?.evs ?? null)),
    eve: adj(usePeers ? bound(eve, def?.eve) : (def?.eve ?? null)),
    pe: adj(usePeers ? bound(pe, def?.pe) : (def?.pe ?? null)),
  };
  part.detail.push(
    usePeers
      ? `비교 기업 ${peers.length}곳: ${peers.map((p) => p.symbol).join(", ")}`
      : `비교 기업 ${peers.length}곳뿐(3곳 미만) — ${f.sector ?? "업종"} 기본 배수(참고값) 사용`,
  );
  if (a.multAdj !== 1) part.detail.push(`시나리오 배수 조정 × ${a.multAdj}`);
  const out = earningsOutlook(f);
  if (out.kind === "collapse") {
    part.detail.push("내년 예상 이익이 적자 전환 — 최근 실적(EBITDA·매출)이 일회성일 수 있어 상대가치 적용 불가");
    return part;
  }
  // 이익을 내는 기업은 이익 기반 배수(EV/EBITDA·선행 PER)를 우선, 매출 배수는 이익이 없을 때만 사용
  const nc = netCash(f);
  const implied: number[] = [];
  if (out.kind === "decline") {
    part.detail.push("이익 감소 전망 — 지난 12개월 EBITDA 대신 내년 예상 이익(선행 PER)만 사용");
  } else if (m.eve != null && f.ebitda && f.ebitda > 0) {
    const v = (m.eve * f.ebitda + nc) / shares;
    if (v > 0) implied.push(v);
    part.detail.push(`EV/EBITDA ${m.eve.toFixed(1)}배 × EBITDA ${usd(f.ebitda)} + 순현금 ${usd(nc)} → ${d2(v)}`);
  }
  if (m.pe != null && f.forwardEps && f.forwardEps > 0) {
    // 예상 EPS는 기존 주식 수 기준이라 희석분만큼 낮춘다
    const dil = f.sharesOutstanding && shares > f.sharesOutstanding ? f.sharesOutstanding / shares : 1;
    const v = m.pe * f.forwardEps * dil;
    implied.push(v);
    part.detail.push(`선행 PER ${m.pe.toFixed(1)}배 × 내년 예상 EPS ${d2(f.forwardEps)}${dil < 1 ? ` × 희석 조정 ${(dil * 100).toFixed(0)}%` : ""} → ${d2(v)}`);
  } else if (f.forwardEps != null && f.forwardEps <= 0) {
    part.detail.push("내년 예상 이익이 적자라 PER은 적용하지 않음");
  }
  if (!implied.length && out.kind === "ok" && m.evs != null && f.revenue && f.revenue > 0) {
    const v = (m.evs * f.revenue + nc) / shares;
    if (v > 0) implied.push(v);
    part.detail.push(`이익이 없어 EV/매출 ${m.evs.toFixed(1)}배 × 매출 ${usd(f.revenue)} 사용 → ${d2(v)}`);
  }
  if (!implied.length) {
    part.detail.push("적용 가능한 배수 없음 — 계산 불가");
    return part;
  }
  part.value = implied.reduce((x, y) => x + y, 0) / implied.length;
  if (implied.length > 1) part.detail.push("두 방식의 평균 사용");
  return part;
}

// ───────── 3) 성장성 및 경쟁력 ─────────

function growthValue(f: Fundamentals, shares: number | null, a: Assumptions): ValuationPart {
  const part: ValuationPart = { key: "growth", label: "성장성 및 경쟁력", weight: 0.2, value: null, detail: [] };
  if (!shares || !f.revenue || f.revenue <= 0) {
    part.detail.push("매출·주식 수 데이터 없음 — 계산 불가");
    return part;
  }
  if (earningsOutlook(f).kind !== "ok") {
    part.detail.push("내년 이익 감소(또는 적자 전환) 전망 — 성장성 가치는 적용하지 않음");
    return part;
  }
  const sg = sustainableGrowth(f);
  const rg = clamp(sg.g * (sg.g > 0 ? a.growthMul : 1), -0.5, 0.3); // 성장 가점은 30%까지만
  const gm = f.grossMargin ?? 0.3;
  const om = f.operatingMargin ?? 0;
  const fair = clamp(0.8 + 12 * Math.max(rg, 0) + 3 * Math.max(gm, 0) + 5 * Math.max(om, 0) - (rg < 0 ? 4 * -rg : 0), 0.4, 10);
  part.value = (fair * f.revenue + netCash(f)) / shares;
  part.detail.push(
    ...(sg.note ? [sg.note] : []),
    `반영 성장률 ${pct(rg)}(최대 30%), 총이익률 ${pct(gm)}(경쟁력·가격결정력), 영업이익률 ${pct(om)}`,
    `적정 EV/매출 = 0.8 + 12×성장률 + 3×총이익률 + 5×영업이익률 = ${fair.toFixed(2)}배`,
    `× 매출 ${usd(f.revenue)} + 순현금 ${usd(netCash(f))} ÷ ${(shares / 1e6).toFixed(1)}M주 → ${d2(part.value)}`,
  );
  return part;
}

// ───────── 4) 재무·사업 위험 조정 ─────────
// 변동성(베타)은 DCF 할인율에, 이익 감소 전망은 DCF·상대가치에 이미 반영했으므로 여기서 다시 빼지 않는다.

function riskMultiplier(f: Fundamentals, fundamentalDrop: boolean): { mult: number; detail: string[] } {
  const d: string[] = [];
  let m = 1;
  const nd = (f.debt ?? 0) - (f.cash ?? 0);
  if (!isFinancialCo(f) && f.ebitda && f.ebitda > 0 && nd / f.ebitda > 3) {
    m -= 0.1;
    d.push(`순부채/EBITDA ${(nd / f.ebitda).toFixed(1)}배 (과다) −10%`);
  }
  const fin = isFinancialCo(f);
  if (!fin && f.freeCashflow != null && f.freeCashflow < 0) {
    m -= 0.15;
    d.push("FCF 적자 (증자·희석 위험) −15%");
  }
  if (f.revenueGrowth != null && f.revenueGrowth < 0) {
    m -= 0.1;
    d.push(`매출 감소 ${pct(f.revenueGrowth)} −10%`);
  }
  const dil = f.sharesChangeYoY;
  if (dil != null && dil > 0.1) {
    m -= 0.1;
    d.push(`1년간 주식 수 ${pct(dil)} 증가 (희석 큼) −10%`);
  } else if (dil != null && dil > 0.04) {
    m -= 0.05;
    d.push(`1년간 주식 수 ${pct(dil)} 증가 (희석) −5%`);
  }
  if (f.shortPercentFloat != null && f.shortPercentFloat > 0.2) {
    m -= 0.05;
    d.push(`공매도 비율 ${pct(f.shortPercentFloat)} −5%`);
  }
  if (fundamentalDrop) {
    m -= 0.05;
    d.push("최근 하락에 실적·성장 악재 포함 −5%");
  }
  if (!fin && f.currentRatio != null && f.currentRatio >= 2 && nd < 0 && (f.freeCashflow ?? 0) > 0) {
    m += 0.05;
    d.push("순현금 + FCF 흑자 + 유동성 충분 +5%");
  }
  if (!d.length) d.push("두드러진 재무·사업 위험 없음 (조정 없음)");
  d.push("변동성은 DCF 할인율에 이미 반영해 중복 차감하지 않음");
  return { mult: clamp(m, 0.6, 1.05), detail: d };
}

// ───────── 통합 ─────────

/** 은행·보험·대출·자본시장 회사: 예금·대출 자체가 영업이라 FCF·EV 기반 가치평가가 맞지 않는다 */
export function isFinancialCo(f: Fundamentals) {
  return (
    f.sector === "Financial Services" &&
    /bank|mortgage|credit|insurance|lending|capital markets|financial conglomerate|savings|thrift|reit/i.test(f.industry ?? "")
  );
}

/** 금융회사 상대가치: 선행 PER × 예상 EPS 와 PBR × 주당순자산(BPS) */
function financialPeerValue(f: Fundamentals, peers: Fundamentals[], a: Assumptions): ValuationPart {
  const part: ValuationPart = { key: "peer", label: "동종업계 상대가치 (PER·PBR)", weight: 0.3, value: null, detail: [] };
  const usePeers = peers.length >= 3;
  const pe0 = median(peers.map((p) => p.forwardPE).filter((v): v is number => v != null && v >= 4 && v < 40));
  const pb0 = median(peers.map((p) => p.priceToBook).filter((v): v is number => v != null && v > 0.2 && v < 6));
  const pe = clamp(usePeers && pe0 != null ? pe0 : 12, 7, 18) * a.multAdj;
  const pb = clamp(usePeers && pb0 != null ? pb0 : 1.2, 0.6, 2.5) * a.multAdj;
  part.detail.push(
    "금융회사는 예금·대출·보험료 자체가 영업이라 현금흐름(FCF)·EV/EBITDA 대신 PER과 PBR로 평가합니다",
    usePeers ? `비교 기업 ${peers.length}곳: ${peers.map((p) => p.symbol).join(", ")}` : "비교 기업 부족 — 금융업 기본 배수(PER 12배·PBR 1.2배) 사용",
  );
  if (a.multAdj !== 1) part.detail.push(`시나리오 배수 조정 × ${a.multAdj}`);
  const implied: number[] = [];
  if (f.forwardEps && f.forwardEps > 0) {
    implied.push(pe * f.forwardEps);
    part.detail.push(`선행 PER ${pe.toFixed(1)}배 × 내년 예상 EPS ${d2(f.forwardEps)} → ${d2(pe * f.forwardEps)}`);
  } else part.detail.push("내년 예상 이익이 없거나 적자 — PER 적용 안 함");
  if (f.bookValuePerShare && f.bookValuePerShare > 0) {
    implied.push(pb * f.bookValuePerShare);
    part.detail.push(`PBR ${pb.toFixed(2)}배 × 주당순자산 ${d2(f.bookValuePerShare)} → ${d2(pb * f.bookValuePerShare)}`);
  } else part.detail.push("주당순자산 확인 불가 — PBR 적용 안 함");
  if (!implied.length) {
    part.detail.push("적용 가능한 배수 없음 — 계산 불가");
    return part;
  }
  part.value = implied.reduce((x, y) => x + y, 0) / implied.length;
  if (implied.length > 1) part.detail.push("두 방식의 평균 사용");
  return part;
}

function runModel(f: Fundamentals, peers: Fundamentals[], fundamentalDrop: boolean, a: Assumptions) {
  const shares = dilutedShares(f);
  const fin = isFinancialCo(f);
  const na = (key: ValuationPart["key"], label: string, weight: number): ValuationPart => ({
    key,
    label,
    weight,
    value: null,
    detail: ["금융회사(은행·보험·대출 등)에는 적용하지 않음 — 상대가치(PER·PBR)로 평가"],
  });
  const base = fin
    ? [na("dcf", "DCF 현금흐름 가치", 0.4), financialPeerValue(f, peers, a), na("growth", "성장성 및 경쟁력", 0.2)]
    : [dcf(f, shares, a), peerValue(f, peers, shares, a), growthValue(f, shares, a)];
  // 성장성 항목이 과도하게 튀지 않도록: DCF·상대가치 평균의 1.5배를 상한으로
  const anchors = base
    .slice(0, 2)
    .map((p) => p.value)
    .filter((v): v is number => v != null && v > 0);
  const gp = base[2];
  if (anchors.length && gp.value != null) {
    const cap = (1.5 * anchors.reduce((x, y) => x + y, 0)) / anchors.length;
    if (gp.value > cap) {
      gp.detail.push(`DCF·상대가치 평균의 1.5배(${d2(cap)})를 넘어 상한 적용`);
      gp.value = cap;
    }
  }
  const risk = riskMultiplier(f, fundamentalDrop);
  const avail = base.filter((p) => p.value != null && p.value > 0);
  if (!avail.length) return { parts: base, value: null as number | null, usedWeight: 0, risk, shares };
  const baseW = avail.reduce((x, p) => x + p.weight, 0);
  const baseValue = avail.reduce((x, p) => x + p.weight * p.value!, 0) / baseW;
  const riskPart: ValuationPart = {
    key: "risk",
    label: "재무·사업 위험 조정",
    weight: 0.1,
    value: baseValue * risk.mult,
    detail: [`위 항목 가중평균 ${d2(baseValue)} × 위험 계수 ${risk.mult.toFixed(2)}`, ...risk.detail],
  };
  const parts = [...base, riskPart];
  const used = parts.filter((p) => p.value != null && p.value > 0);
  const usedWeight = used.reduce((x, p) => x + p.weight, 0);
  const value = used.reduce((x, p) => x + p.weight * p.value!, 0) / usedWeight;
  return { parts, value: value as number | null, usedWeight, risk, shares };
}

function confidenceOf(f: Fundamentals, peers: Fundamentals[], parts: ValuationPart[], usedWeight: number): Confidence {
  const reasons: string[] = [];
  let s = 0;
  if (isFinancialCo(f)) {
    usedWeight = 1; // 금융회사는 PER·PBR만 쓰는 것이 정상
    reasons.push("금융회사 — PER·PBR 기준 평가");
  }
  if (usedWeight >= 0.95) {
    s += 2;
    reasons.push("네 가지 방법을 모두 계산함");
  } else if (usedWeight >= 0.6) {
    s += 1;
    reasons.push(`일부 방법만 계산 가능 (반영 비중 ${Math.round(usedWeight * 100)}%)`);
  } else reasons.push(`계산 가능한 방법이 적음 (반영 비중 ${Math.round(usedWeight * 100)}%)`);
  if (peers.length >= 3) {
    s += 1;
    reasons.push(`비교 기업 ${peers.length}곳`);
  } else reasons.push("비교 기업 부족 — 업종 기본 배수 사용");
  const vals = parts
    .filter((p) => p.key !== "risk")
    .map((p) => p.value)
    .filter((v): v is number => v != null && v > 0);
  if (vals.length >= 2) {
    const spread = Math.max(...vals) / Math.min(...vals);
    if (spread <= 1.6) {
      s += 1;
      reasons.push("방법별 결과가 비슷함");
    } else reasons.push(`방법별 결과 차이가 큼 (최대/최소 ${spread.toFixed(1)}배)`);
  }
  const out = earningsOutlook(f);
  if (out.kind === "ok") s += 1;
  else reasons.push(out.kind === "collapse" ? "내년 적자 전환 전망 (실적 불확실)" : "내년 이익 감소 전망 (실적 불확실)");
  if (isFinancialCo(f) || (f.freeCashflow != null && f.freeCashflow > 0)) s += 1;
  else reasons.push("현금흐름 적자 또는 확인 불가");
  const level = s >= 5 ? "high" : s >= 3 ? "mid" : "low";
  return { level, label: { high: "신뢰도 높음", mid: "신뢰도 보통", low: "신뢰도 낮음" }[level], reasons };
}

function emptyValuation(note: string, f: Fundamentals | null): Valuation {
  return {
    fairValue: null,
    parts: [],
    usedWeight: 0,
    upside: null,
    riskMultiplier: 1,
    notes: [note],
    shares: {
      basic: f?.sharesOutstanding ?? null,
      diluted: f?.dilutedShares ?? null,
      used: f ? dilutedShares(f) : null,
      changeYoY: f?.sharesChangeYoY ?? null,
    },
    netCash: f ? netCash(f) : null,
    scenarios: [],
    confidence: { level: "low", label: "계산 불가", reasons: [note] },
  };
}

export function fairValueModel(f: Fundamentals | null, peers: Fundamentals[], price: number, fundamentalDrop = false): Valuation {
  if (!f) return emptyValuation("재무 데이터가 없어 적정가를 계산할 수 없습니다.", null);
  // ADR 등 재무제표가 달러가 아닌 기업은 주가(달러)와 단위가 달라 계산하지 않음
  if (f.financialCurrency && f.financialCurrency !== "USD") {
    return emptyValuation(
      `재무제표 통화가 ${f.financialCurrency}(달러 아님)라 주가와 단위가 맞지 않아 적정가를 계산하지 않습니다. 적정가를 직접 입력하세요.`,
      f,
    );
  }
  peers = peers.filter((p) => !p.financialCurrency || p.financialCurrency === "USD");
  const runs = SCENARIOS.map((a) => ({ a, r: runModel(f, peers, fundamentalDrop, a) }));
  const base = runs[1].r;
  const notes: string[] = [];
  const out = earningsOutlook(f);

  if (base.value == null) {
    const v = emptyValuation(
      out.kind === "collapse"
        ? "내년 예상 이익이 적자로 전환될 전망이라 최근 실적이 일회성일 가능성이 큽니다 — 적정가를 계산하지 않습니다."
        : "계산 가능한 가치 항목이 없습니다.",
      f,
    );
    return { ...v, parts: base.parts, riskMultiplier: base.risk.mult };
  }

  const capValue = price > 0 ? price * (1 + MAX_UPSIDE) : Infinity;
  const fairValue = Math.min(base.value, capValue);
  if (base.value > capValue) {
    notes.push(`모델 계산값 ${d2(base.value)}이(가) 현재가의 2배를 넘어 +${MAX_UPSIDE * 100}% 상한(${d2(capValue)})을 적용했습니다. 반등 목표로는 이 범위가 현실적입니다.`);
  }
  if (out.kind !== "ok") {
    notes.push(
      out.kind === "collapse"
        ? "내년 예상 이익이 적자로 전환될 전망입니다 — 최근 실적이 일회성일 수 있어 보수적으로 계산했습니다."
        : `내년 예상 이익이 최근 12개월보다 ${Math.round((1 - out.ratio!) * 100)}% 적을 전망이라 현금흐름 가치를 낮췄습니다.`,
    );
  }
  if (base.usedWeight < 0.999) notes.push(`계산 불가 항목을 제외하고 나머지 비중(${Math.round(base.usedWeight * 100)}%)으로 다시 나눴습니다.`);

  // 방법별 차이가 크면 이유 설명
  const dcfV = base.parts[0].value;
  const peerV = base.parts[1].value;
  if (dcfV && peerV && Math.max(dcfV, peerV) / Math.min(dcfV, peerV) > 1.8) {
    notes.push(
      dcfV > peerV
        ? `DCF(${d2(dcfV)})가 상대가치(${d2(peerV)})보다 훨씬 높습니다 — 현금 창출력에 비해 업계가 낮은 배수를 주고 있거나, 성장 가정이 낙관적일 수 있습니다.`
        : `상대가치(${d2(peerV)})가 DCF(${d2(dcfV)})보다 훨씬 높습니다 — 비교 기업들은 높게 평가받지만 이 회사의 현재 현금흐름은 그만큼 뒷받침되지 않습니다.`,
    );
  }
  const shares = base.shares;
  if (f.sharesOutstanding && shares && shares > f.sharesOutstanding * 1.02) {
    notes.push(
      `스톡옵션·전환사채 등을 포함한 완전희석주식수 ${(shares / 1e6).toFixed(1)}M주(발행주식보다 ${pct(shares / f.sharesOutstanding - 1)} 많음)로 계산했습니다.`,
    );
  }
  notes.push("가정에 민감한 참고 시나리오입니다. 보장된 적정가가 아닙니다.");

  const scenarios: Scenario[] = runs.map(({ a, r }) => {
    const label = SCENARIOS.find((s) => s.key === a.key)!.label;
    let v = r.value;
    if (v != null) {
      if (a.key === "bear") v = Math.min(v, fairValue);
      if (a.key === "base") v = fairValue;
      if (a.key === "bull") v = Math.max(Math.min(v, price * (1 + MAX_UPSIDE_BULL)), fairValue);
    }
    return {
      key: a.key,
      label,
      growth: startGrowth(f, a).g0,
      rate: f.freeCashflow && f.freeCashflow > 0 ? discountRate(f, a).r : null,
      multipleAdj: a.multAdj,
      fairValue: v,
      marketCap: v != null && shares ? v * shares : null,
      upside: v != null && price > 0 ? ((v - price) / price) * 100 : null,
    };
  });

  return {
    fairValue,
    parts: base.parts,
    usedWeight: base.usedWeight,
    upside: ((fairValue - price) / price) * 100,
    riskMultiplier: base.risk.mult,
    notes,
    shares: { basic: f.sharesOutstanding ?? null, diluted: f.dilutedShares ?? null, used: shares, changeYoY: f.sharesChangeYoY ?? null },
    netCash: netCash(f),
    scenarios,
    confidence: confidenceOf(f, peers, base.parts, base.usedWeight),
  };
}
