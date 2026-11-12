// 이중 투자전략 적정가 모델 1.0 (서버·클라이언트 공용 순수 함수)
//   DCF 현금흐름 가치        40%
//   동종업계 상대가치        30%
//   성장성 및 경쟁력         20%
//   재무·사업 위험 조정      10%
// 애널리스트 목표가·투자의견은 사용하지 않는다.
// 계산할 수 없는 항목(예: FCF 적자 기업의 DCF)은 빼고 나머지 비중으로 다시 나눈다.
import type { Fundamentals } from "./types";

export const MODEL_NAME = "이중 투자전략 적정가 모델 1.0";

export interface ValuationPart {
  key: "dcf" | "peer" | "growth" | "risk";
  label: string;
  weight: number; // 0.4 / 0.3 / 0.2 / 0.1
  value: number | null; // 주당 가치 ($)
  detail: string[];
}

export interface Valuation {
  fairValue: number | null;
  parts: ValuationPart[];
  usedWeight: number; // 실제 반영된 비중 합
  upside: number | null; // 현재가 대비 %
  riskMultiplier: number;
  notes: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const usd = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e9 ? `$${(a / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(a / 1e6).toFixed(0)}M` : `$${a.toFixed(2)}`;
  return v < 0 ? `-${s}` : s;
};
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

function netCash(f: Fundamentals) {
  return (f.cash ?? 0) - (f.debt ?? 0);
}

/** 1) DCF: TTM 잉여현금흐름 기준 10년 2단계 할인 */
function dcf(f: Fundamentals): ValuationPart {
  const part: ValuationPart = { key: "dcf", label: "DCF 현금흐름 가치", weight: 0.4, value: null, detail: [] };
  const fcf = f.freeCashflow;
  const shares = f.sharesOutstanding;
  if (!shares) {
    part.detail.push("발행주식 수 데이터 없음 — 계산 불가");
    return part;
  }
  if (fcf == null || fcf <= 0) {
    part.detail.push(`잉여현금흐름(FCF) ${fcf == null ? "데이터 없음" : `${usd(fcf)} 적자`} — DCF 적용 불가, 나머지 항목으로 계산`);
    return part;
  }
  const g0 = clamp(f.revenueGrowth ?? 0.03, -0.05, 0.25);
  const gT = 0.025;
  const beta = clamp(f.beta ?? 1, 0.6, 2.5);
  const r = clamp(0.07 + beta * 0.025, 0.08, 0.12); // 기본 7% + 베타 × 2.5% (8~12% 범위)
  let cf = fcf;
  let pv = 0;
  for (let y = 1; y <= 10; y++) {
    // 1~5년: 현재 성장률 → 3%로 수렴, 6~10년: 3% → 2.5%
    const g = y <= 5 ? g0 + ((0.03 - g0) * (y - 1)) / 4 : 0.03 + ((gT - 0.03) * (y - 5)) / 5;
    cf *= 1 + g;
    pv += cf / (1 + r) ** y;
  }
  const tv = (cf * (1 + gT)) / (r - gT);
  const pvTv = tv / (1 + r) ** 10;
  const equity = pv + pvTv + netCash(f);
  part.detail.push(
    `기준 FCF ${usd(fcf)} (최근 12개월)`,
    `성장률: ${pct(g0)}에서 5년간 3%로 수렴 → 10년차 2.5% (영구성장)`,
    `할인율 ${pct(r)} (기본 7% + 베타 ${beta.toFixed(2)} × 2.5%)`,
    `현금흐름 현재가치 ${usd(pv)} + 잔존가치 ${usd(pvTv)} + 순현금 ${usd(netCash(f))} = 주주가치 ${usd(equity)}`,
  );
  if (equity <= 0) {
    part.detail.push("순부채가 현금흐름 가치보다 커서 주주가치가 0 이하 — DCF 적용 불가");
    return part;
  }
  part.value = equity / shares;
  return part;
}

/** 2) 동종업계 상대가치: 비교 기업 배수 중앙값 적용 */
function peerValue(f: Fundamentals, peers: Fundamentals[]): ValuationPart {
  const part: ValuationPart = { key: "peer", label: "동종업계 상대가치", weight: 0.3, value: null, detail: [] };
  const shares = f.sharesOutstanding;
  if (!shares) {
    part.detail.push("발행주식 수 데이터 없음 — 계산 불가");
    return part;
  }
  const evs = median(peers.map((p) => p.evToRevenue).filter((v): v is number => v != null && v > 0 && v < 50));
  const eve = median(peers.map((p) => p.evToEbitda).filter((v): v is number => v != null && v > 0 && v < 80));
  const pe = median(peers.map((p) => p.forwardPE).filter((v): v is number => v != null && v > 0 && v < 100));
  const def = f.sector ? SECTOR_DEFAULT[f.sector] : undefined;
  const usePeers = peers.length >= 2;
  const m = {
    evs: usePeers && evs != null ? evs : def?.evs ?? null,
    eve: usePeers && eve != null ? eve : def?.eve ?? null,
    pe: usePeers && pe != null ? pe : def?.pe ?? null,
  };
  part.detail.push(
    usePeers
      ? `비교 기업 ${peers.length}곳: ${peers.map((p) => p.symbol).join(", ")}`
      : `비교 기업 부족 — ${f.sector ?? "업종"} 기본 배수(참고값) 사용`,
  );
  // 이익을 내는 기업은 이익 기반 배수(EV/EBITDA·선행 PER)를 우선, 매출 배수는 이익이 없을 때만 사용
  const implied: number[] = [];
  if (m.eve != null && f.ebitda && f.ebitda > 0) {
    const v = (m.eve * f.ebitda + netCash(f)) / shares;
    if (v > 0) implied.push(v);
    part.detail.push(`EV/EBITDA ${m.eve.toFixed(1)}배 × EBITDA ${usd(f.ebitda)} → $${v.toFixed(2)}`);
  }
  if (m.pe != null && f.forwardEps && f.forwardEps > 0) {
    const v = m.pe * f.forwardEps;
    implied.push(v);
    part.detail.push(`선행 PER ${m.pe.toFixed(1)}배 × 예상 EPS $${f.forwardEps.toFixed(2)} → $${v.toFixed(2)}`);
  }
  if (!implied.length && m.evs != null && f.revenue && f.revenue > 0) {
    const v = (m.evs * f.revenue + netCash(f)) / shares;
    if (v > 0) implied.push(v);
    part.detail.push(`이익이 없어 EV/매출 ${m.evs.toFixed(1)}배 × 매출 ${usd(f.revenue)} 사용 → $${v.toFixed(2)}`);
  }
  if (!implied.length) {
    part.detail.push("적용 가능한 배수 없음 — 계산 불가");
    return part;
  }
  part.value = implied.reduce((a, b) => a + b, 0) / implied.length;
  if (implied.length > 1) part.detail.push("두 방식의 평균 사용");
  return part;
}

/** 3) 성장성 및 경쟁력: 성장률·총이익률·영업이익률로 적정 EV/매출 배수 산출 */
function growthValue(f: Fundamentals): ValuationPart {
  const part: ValuationPart = { key: "growth", label: "성장성 및 경쟁력", weight: 0.2, value: null, detail: [] };
  if (!f.sharesOutstanding || !f.revenue || f.revenue <= 0) {
    part.detail.push("매출·주식 수 데이터 없음 — 계산 불가");
    return part;
  }
  const rg = f.revenueGrowth ?? 0;
  const gm = f.grossMargin ?? 0.3;
  const om = f.operatingMargin ?? 0;
  const fair = clamp(0.8 + 12 * Math.max(rg, 0) + 3 * Math.max(gm, 0) + 5 * Math.max(om, 0) - (rg < 0 ? 4 * -rg : 0), 0.4, 15);
  part.value = (fair * f.revenue + netCash(f)) / f.sharesOutstanding;
  part.detail.push(
    `매출 성장률 ${pct(rg)}, 총이익률 ${pct(gm)}(경쟁력·가격결정력), 영업이익률 ${pct(om)}`,
    `적정 EV/매출 = 0.8 + 12×성장률 + 3×총이익률 + 5×영업이익률 = ${fair.toFixed(2)}배`,
    `× 매출 ${usd(f.revenue)} + 순현금 ${usd(netCash(f))} → $${part.value.toFixed(2)}`,
  );
  return part;
}

/** 4) 재무·사업 위험 조정: 위험 요인만큼 기준 가치를 할인 */
function riskMultiplier(f: Fundamentals, fundamentalDrop: boolean): { mult: number; detail: string[] } {
  const d: string[] = [];
  let m = 1;
  const nd = (f.debt ?? 0) - (f.cash ?? 0);
  if (f.ebitda && f.ebitda > 0 && nd / f.ebitda > 3) {
    m -= 0.1;
    d.push(`순부채/EBITDA ${(nd / f.ebitda).toFixed(1)}배 (과다) −10%`);
  }
  if (f.freeCashflow != null && f.freeCashflow < 0) {
    m -= 0.15;
    d.push("FCF 적자 (증자·희석 위험) −15%");
  }
  if (f.revenueGrowth != null && f.revenueGrowth < 0) {
    m -= 0.1;
    d.push(`매출 감소 ${pct(f.revenueGrowth)} −10%`);
  }
  if (f.shortPercentFloat != null && f.shortPercentFloat > 0.2) {
    m -= 0.05;
    d.push(`공매도 비율 ${pct(f.shortPercentFloat)} −5%`);
  }
  if (f.beta != null && f.beta > 2) {
    m -= 0.05;
    d.push(`베타 ${f.beta.toFixed(2)} (변동성 큼) −5%`);
  }
  if (fundamentalDrop) {
    m -= 0.05;
    d.push("최근 하락에 실적·성장 악재 포함 −5%");
  }
  if (f.currentRatio != null && f.currentRatio >= 2 && nd < 0 && (f.freeCashflow ?? 0) > 0) {
    m += 0.05;
    d.push("순현금 + FCF 흑자 + 유동성 충분 +5%");
  }
  if (!d.length) d.push("두드러진 재무·사업 위험 없음 (조정 없음)");
  return { mult: clamp(m, 0.6, 1.05), detail: d };
}

export function fairValueModel(f: Fundamentals | null, peers: Fundamentals[], price: number, fundamentalDrop = false): Valuation {
  if (!f) {
    return { fairValue: null, parts: [], usedWeight: 0, upside: null, riskMultiplier: 1, notes: ["재무 데이터가 없어 적정가를 계산할 수 없습니다."] };
  }
  // ADR 등 재무제표가 달러가 아닌 기업은 주가(달러)와 단위가 달라 계산하지 않음
  if (f.financialCurrency && f.financialCurrency !== "USD") {
    return {
      fairValue: null,
      parts: [],
      usedWeight: 0,
      upside: null,
      riskMultiplier: 1,
      notes: [`재무제표 통화가 ${f.financialCurrency}(달러 아님)라 주가와 단위가 맞지 않아 적정가를 계산하지 않습니다. 적정가를 직접 입력하세요.`],
    };
  }
  peers = peers.filter((p) => !p.financialCurrency || p.financialCurrency === "USD");
  const base = [dcf(f), peerValue(f, peers), growthValue(f)];
  // 성장성 항목이 과도하게 튀지 않도록: DCF·상대가치 평균의 2배를 상한으로
  const anchors = base.slice(0, 2).map((p) => p.value).filter((v): v is number => v != null && v > 0);
  const gp = base[2];
  if (anchors.length && gp.value != null) {
    const cap = (2 * anchors.reduce((a, b) => a + b, 0)) / anchors.length;
    if (gp.value > cap) {
      gp.detail.push(`DCF·상대가치 평균의 2배($${cap.toFixed(2)})를 넘어 상한 적용`);
      gp.value = cap;
    }
  }
  const avail = base.filter((p) => p.value != null && p.value > 0);
  const notes: string[] = [];
  const risk = riskMultiplier(f, fundamentalDrop);

  if (!avail.length) {
    return { fairValue: null, parts: [...base], usedWeight: 0, upside: null, riskMultiplier: risk.mult, notes: ["계산 가능한 가치 항목이 없습니다."] };
  }
  const baseW = avail.reduce((a, p) => a + p.weight, 0);
  const baseValue = avail.reduce((a, p) => a + p.weight * p.value!, 0) / baseW;
  const riskPart: ValuationPart = {
    key: "risk",
    label: "재무·사업 위험 조정",
    weight: 0.1,
    value: baseValue * risk.mult,
    detail: [`위 항목 가중평균 $${baseValue.toFixed(2)} × 위험 계수 ${risk.mult.toFixed(2)}`, ...risk.detail],
  };
  const parts = [...base, riskPart];
  const used = parts.filter((p) => p.value != null && p.value > 0);
  const usedWeight = used.reduce((a, p) => a + p.weight, 0);
  const fairValue = used.reduce((a, p) => a + p.weight * p.value!, 0) / usedWeight;
  if (usedWeight < 0.999) notes.push(`계산 불가 항목을 제외하고 나머지 비중(${Math.round(usedWeight * 100)}%)으로 다시 나눴습니다.`);
  notes.push("가정에 민감한 참고 시나리오입니다. 보장된 적정가가 아닙니다.");
  return { fairValue, parts, usedWeight, upside: ((fairValue - price) / price) * 100, riskMultiplier: risk.mult, notes };
}
