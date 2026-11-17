// 몇 주 살지 계산 (순수 함수)
// 원칙: 손절가에 걸려도 전체 투자금의 1~2%만 잃는다 + 한 종목 비중 상한 + 약세장이면 절반
export interface SizingInput {
  account: number; // 투자금 ($)
  riskPct: number; // 한 번에 감수할 손실 % (1~2)
  maxWeight: number; // 한 종목 최대 비중 % (기본 20)
  price: number;
  stop: number | null;
  bear: boolean; // 약세장이면 절반
}

export interface SizingResult {
  shares: number;
  cost: number;
  weight: number; // 투자금 대비 %
  lossAtStop: number; // 손절 시 손실 ($)
  lossPct: number; // 투자금 대비 %
  limitedBy: "risk" | "weight";
  firstBuy: number; // 분할 매수 1차 수량 (절반)
  maxStocks: number; // 동시에 보유할 종목 수 상한
  notes: string[];
}

export function sizePosition(i: SizingInput): SizingResult | null {
  if (!(i.account > 0) || !(i.price > 0)) return null;
  const notes: string[] = [];
  const factor = i.bear ? 0.5 : 1;
  if (i.bear) notes.push("약세장이라 평소의 절반으로 줄였습니다.");
  const budgetRisk = i.account * (i.riskPct / 100) * factor;
  const budgetWeight = i.account * (i.maxWeight / 100) * factor;
  const perShare = i.stop != null && i.stop < i.price ? i.price - i.stop : i.price * 0.1; // 손절가가 없으면 −10% 가정
  if (i.stop == null || i.stop >= i.price) notes.push("손절가가 없어 −10%를 손절선으로 가정했습니다.");
  const byRisk = Math.floor(budgetRisk / perShare);
  const byWeight = Math.floor(budgetWeight / i.price);
  const shares = Math.max(0, Math.min(byRisk, byWeight));
  const limitedBy = byRisk <= byWeight ? "risk" : "weight";
  if (shares === 0) notes.push("투자금에 비해 주가가 높아 1주도 살 수 없습니다. 투자금을 늘리거나 다른 종목을 고르세요.");
  const cost = shares * i.price;
  const lossAtStop = shares * perShare;
  return {
    shares,
    cost,
    weight: (cost / i.account) * 100,
    lossAtStop,
    lossPct: (lossAtStop / i.account) * 100,
    limitedBy,
    firstBuy: Math.max(shares > 0 ? 1 : 0, Math.ceil(shares / 2)),
    maxStocks: Math.max(3, Math.floor(100 / i.maxWeight)),
    notes,
  };
}
