// 세후 수익 계산 (한국 거주자 기준, 미국 주식)
//  - 매매 수수료: 증권사마다 다름 (보통 0.07~0.25%) → 보수적으로 0.25% 가정
//  - 해외주식 양도소득세: 1년(1~12월) 동안 해외주식 매매로 번 순이익에서 250만 원을 뺀 금액의 22% (지방소득세 포함)
//    다음 해 5월에 직접 신고·납부. 손실이 난 종목과 이익이 난 종목은 서로 상계된다.
//  - 배당금 세금, 환전 수수료(환율 우대에 따라 다름)는 반영하지 않는다.
export const FEE_RATE = 0.0025;
export const TAX_RATE = 0.22;
export const TAX_FREE_KRW = 2_500_000;

export interface AfterTax {
  grossUsd: number; // 매매 차익 ($)
  feesUsd: number; // 사고팔 때 수수료 ($)
  netUsd: number; // 수수료 뺀 이익 ($)
  netKrw: number | null;
  taxKrw: number | null; // 이 거래로 늘어나는 양도소득세 (올해 다른 이익 포함 계산)
  afterTaxKrw: number | null; // 세금까지 뺀 손에 쥐는 금액
}

export function afterTax(i: { buy: number; sell: number; shares: number; rate: number | null; otherGainsKrw?: number }): AfterTax {
  const grossUsd = (i.sell - i.buy) * i.shares;
  const feesUsd = (i.buy + i.sell) * i.shares * FEE_RATE;
  const netUsd = grossUsd - feesUsd;
  if (i.rate == null) return { grossUsd, feesUsd, netUsd, netKrw: null, taxKrw: null, afterTaxKrw: null };
  const netKrw = netUsd * i.rate;
  const other = i.otherGainsKrw ?? 0;
  const taxable = (x: number) => Math.max(0, x - TAX_FREE_KRW);
  const taxKrw = netKrw > 0 ? (taxable(other + netKrw) - taxable(other)) * TAX_RATE : 0;
  return { grossUsd, feesUsd, netUsd, netKrw, taxKrw, afterTaxKrw: netKrw - taxKrw };
}
