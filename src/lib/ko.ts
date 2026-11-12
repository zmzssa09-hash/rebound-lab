// 화면 표시용 한국어 변환

export const BRAND = "리바운드 랩";

/** 거래소 이름 → 한국어 */
export function exchangeKo(name: string): string {
  const n = name.trim();
  if (/^nasdaq|^NMS|^NGM|^NCM|^NIM/i.test(n)) return "나스닥";
  if (/arca|^PCX/i.test(n)) return "NYSE 아카";
  if (/american|^ASE/i.test(n)) return "NYSE 아메리칸";
  if (/^nyse|^NYQ/i.test(n)) return "뉴욕증권거래소";
  if (/cboe|chicago|^BATS|^BTS|^WCB|^CBO/i.test(n)) return "시카고옵션거래소";
  if (/^IEX/i.test(n)) return "IEX";
  if (/^SNP/i.test(n)) return "S&P 지수";
  if (/^DJI/i.test(n)) return "다우 지수";
  return n;
}

/** 상품 유형 → 한국어 */
export function typeKo(type: string): string {
  const t = type.trim().toUpperCase();
  if (t === "EQUITY") return "주식";
  if (t === "ETF") return "ETF";
  if (t === "INDEX") return "지수";
  if (t === "MUTUALFUND" || t === "MUTUAL FUND") return "펀드";
  if (t === "CURRENCY") return "통화";
  if (t === "FUTURE" || t === "FUTURES") return "선물";
  return type;
}

/** 큰 금액을 한국식 단위로: 7,790만 달러 / 12.3억 달러 */
export function bigMoneyKo(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  if (n >= 1e12) return `${(n / 1e12).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}조 달러`;
  if (n >= 1e8) return `${(n / 1e8).toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억 달러`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString("ko-KR")}만 달러`;
  return `${Math.round(n).toLocaleString("ko-KR")}달러`;
}

/** 시장 지표 표시 이름 */
export const MARKET_LABEL: Record<string, string> = {
  SPY: "S&P 500 (SPY)",
  QQQ: "나스닥 100 (QQQ)",
  "^VIX": "VIX 변동성지수",
  "^VIX3M": "VIX 3개월",
};

/** 업종 → SPDR 업종 ETF */
export const SECTOR_ETF: Record<string, string> = {
  Technology: "XLK",
  "Financial Services": "XLF",
  Healthcare: "XLV",
  Energy: "XLE",
  "Consumer Cyclical": "XLY",
  "Consumer Defensive": "XLP",
  Industrials: "XLI",
  "Basic Materials": "XLB",
  Utilities: "XLU",
  "Real Estate": "XLRE",
  "Communication Services": "XLC",
};

export const SECTOR_KO: Record<string, string> = {
  Technology: "기술",
  "Financial Services": "금융",
  Healthcare: "헬스케어",
  Energy: "에너지",
  "Consumer Cyclical": "경기소비재",
  "Consumer Defensive": "필수소비재",
  Industrials: "산업재",
  "Basic Materials": "소재",
  Utilities: "유틸리티",
  "Real Estate": "부동산",
  "Communication Services": "커뮤니케이션",
};
