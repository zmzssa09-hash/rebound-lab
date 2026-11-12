// 공용 타입 정의

export interface Bar {
  time: number; // UNIX seconds (UTC)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ChartMeta {
  symbol: string;
  name: string;
  nameKo?: string | null;
  currency: string;
  exchange: string;
  instrumentType: string;
  price: number;
  previousClose: number | null;
  marketTime: number;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  /** 거래 시간 (UNIX초) — 휴장일·조기 폐장이 반영된 값 */
  tradingPeriod?: { preStart: number; regularStart: number; regularEnd: number; postEnd: number } | null;
}

export interface ChartData {
  meta: ChartMeta;
  bars: Bar[];
  fetchedAt: number;
}

export type Tone = "good" | "warn" | "bad" | "neutral";

export type Trend = "up" | "down" | "mixed" | "unknown";

export interface Snapshot {
  price: number;
  changePct: number | null;
  rsi: number | null;
  rsiPrev: number | null; // 5거래일 전 RSI
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  macdHistPrev: number | null; // 3거래일 전 히스토그램
  macdCrossDaysAgo: number | null; // 최근 골든크로스(양전환) 발생 시점
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  sma50Rising: boolean | null;
  trend: Trend;
  vol20: number | null;
  downDayVolRatio: number | null; // 최근 5일 중 하락일 평균 거래량 / 20일 평균
  low3m: number | null;
  priorLow3m: number | null; // 최근 5일 제외한 3개월 저점
  high52: number | null;
  low52: number | null;
  drawdown52: number | null; // 52주 고점 대비 %
}

export interface Signal {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  detail: string;
}

export interface Verdict {
  title: string;
  tone: Tone;
  summary: string;
}

export interface QuoteSummary {
  symbol: string;
  name: string;
  nameKo?: string | null;
  currency: string;
  instrumentType: string;
  price: number;
  changePct: number | null;
  rsi: number | null;
  trend: Trend;
  macdHist: number | null;
  macdImproving: boolean | null;
  verdict: Verdict;
  marketTime: number;
}

export interface QuoteError {
  symbol: string;
  error: string;
}

// ===== 사용자 데이터 (브라우저 저장) =====

export interface Position {
  id: string;
  symbol: string;
  shares: number;
  avgCost: number;
  target?: number;
  stop?: number;
  deadline?: string; // YYYY-MM-DD 보유 기간 제한
  thesis?: string; // 진입 근거
  invalidation?: string; // 철회 조건
}

export interface Zone {
  id: string;
  label: string;
  low: number;
  high: number;
  condition: string;
}

export interface WatchItem {
  id: string;
  symbol: string;
  note?: string;
  zones: Zone[];
}

export type CheckStatus = "unchecked" | "pass" | "caution" | "fail";

export interface ResearchNote {
  checks?: Record<string, CheckStatus>; // (구버전 체크리스트)
  notes: Record<string, string>;
  thesis: string;
  updatedAt: string;
  // 종목 평가표
  scores?: Record<string, number>; // 직접 채점 항목
  fairValue?: number; // 적정가치 (기준 시나리오)
  redFlags?: Record<string, boolean>;
  // 마지막으로 계산된 결과 (관심 종목 화면 표시용)
  lastTotal?: number;
  lastGrade?: string;
  lastTone?: Tone;
  lastScored?: number;
}

export interface AppData {
  version: 1;
  cash: number;
  positions: Position[];
  watchlist: WatchItem[];
  research: Record<string, ResearchNote>;
  pretrade: Record<string, boolean>;
}

// ===== 추천 종목 =====

export interface PickTag {
  label: string;
  kind: "fundamental" | "analyst" | "external" | "event" | "positive";
}

export interface Pick {
  symbol: string;
  name: string;
  nameKo: string | null;
  sectorKo: string | null;
  price: number;
  changePct: number | null;
  rsi: number | null;
  marketCap: number | null;
  total: number;
  scores: Record<string, number | null>;
  grade: string;
  gradeTone: Tone;
  longTermOk: boolean | null;
  excluded: boolean;
  excludeReason: string | null;
  flags: string[]; // 켜진 회피 신호 라벨
  dropNatureLabel: string;
  dropTone: Tone;
  dropBullets: string[];
  tags: PickTag[];
  fromHigh3m: number;
  fairValue: number | null; // 이중 투자전략 적정가 모델 1.0
  shortGrade: { grade: string; label: string; tone: Tone; expected: string };
  longGrade: { grade: string; label: string; tone: Tone; expected: string };
  resilienceSummary: string;
  // 순위 추적 (Top 10에 든 종목만)
  rank?: number;
  prevRank?: number | null; // 직전 분석 때 순위 (없으면 신규)
  streak?: number; // 연속으로 Top 10에 든 분석 횟수
  firstPickedAt?: number; // 이번 연속 추천이 시작된 시각 (ms)
  firstPrice?: number; // 그때 가격
  rankScore?: number; // 순위용 점수 = 점수 + 지속 보너스
  // 실시간 (API 응답 시 계산)
  live?: { price: number; changePct: number | null; rsi: number | null; total: number; at: number };
}

export interface PickExit {
  symbol: string;
  name: string;
  nameKo: string | null;
  firstPickedAt: number;
  firstPrice: number;
  exitedAt: number;
  exitPrice: number;
  reason: string;
  bestRank: number;
}

// ===== 재무·뉴스 =====

export interface Fundamentals {
  symbol: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  summary: string | null;
  marketCap: number | null;
  revenue: number | null;
  revenueGrowth: number | null; // 전년 동기 대비 (소수)
  earningsGrowth: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  cash: number | null;
  debt: number | null;
  currentRatio: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  financialCurrency: string | null; // 재무제표 통화 (ADR은 현지 통화일 수 있음)
  sharesOutstanding: number | null;
  enterpriseValue: number | null;
  ebitda: number | null;
  forwardEps: number | null;
  trailingEps: number | null;
  shortPercentFloat: number | null;
  beta: number | null;
  earningsDate: number | null; // 가장 최근 또는 다음 실적 발표 (UNIX초)
  quarterlyRevenue: { date: string; revenue: number }[]; // 최신순
}

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  time: number; // UNIX초
}

