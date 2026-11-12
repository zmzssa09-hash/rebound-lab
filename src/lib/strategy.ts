import type { AppData } from "./types";

export const CORE_IDEA =
  "RSI가 낮아진 과매도 종목을 단기 반등(대략 1~3개월) 목적으로 매수하되, 반등이 실패하더라도 기업의 매출·현금흐름·경쟁력·재무상태와 적정가치가 유지된다면 장기 보유 선택지도 남겨두는 전략.";

export const PRINCIPLES = [
  "RSI는 매수 타이밍을 찾는 보조 지표이지, 기업가치나 반등을 보장하는 지표가 아니다.",
  "RSI 30 이하 등 과매도 신호만으로 매수하지 않는다. 하락 추세, MACD, 거래량, 지지선, 악재의 성격을 함께 확인한다.",
  "장기 보유 가능성은 기업의 질로 판단한다. 매출 성장, 영업이익, 영업현금흐름·FCF, 부채, 경쟁우위, 희석(SBC), 밸류에이션을 검토한다.",
  "주가가 더 하락했다는 이유만으로 물타기하지 않는다. 투자 논리가 훼손되면 손실을 감수하고도 재평가한다.",
  "단기 매매의 실패와 장기 보유의 타당성은 별개다. ‘언젠가 오르겠지’가 장기 보유 근거가 되어서는 안 된다.",
  "분할매수는 가격만이 아니라 해당 가격에 도달한 이유와 실적·뉴스 변화를 확인한 뒤 실행한다.",
  "목표 수익률뿐 아니라 최대 손실, 투자 기간, 현금 보유 비중을 매수 전에 정한다.",
  "하락 원인이 매출 감소, 현금흐름 악화, 경쟁력 상실이라면 RSI가 아무리 낮아도 피한다.",
  "종목마다 100점 만점 이중 투자전략 평가(재무 안정성 15, 성장성과 경쟁력 15, 저평가 및 안전마진 15, 기술적 분석 15, 시장 환경 및 수급 10, 수익 잠재력 15, 가격 회복력 15)로 채점하고 S+~F 등급을 매긴다.",
  "적정가는 애널리스트 목표가가 아니라 자체 모델(이중 투자전략 적정가 모델 1.1)로 계산하고, 보수적·기준·낙관적 시나리오와 신뢰도를 함께 본다. 애널리스트 평가는 사용하지 않는다.",
  "하락했다는 이유만으로 싸다고 판단하지 않는다. 적정가에 안전마진을 적용한 매수 구간에서만 사고, 사기 전에 손절선과 손익비를 정한다.",
  "단기(1~4주)와 장기(3~12개월) 기대 수익을 따로 등급으로 나누어 판단한다.",
];

/** 이중 투자전략 적정가 모델 1.1 */
export const FAIR_VALUE_MODEL = [
  { label: "DCF 현금흐름 가치", weight: 40, how: "현금흐름표 기준 최근 12개월 잉여현금흐름(영업현금흐름 − 설비투자)을 10년간 2단계로 할인(시작 성장률 최대 15%, 내년 이익 20%↑ 전망이면 25%, 5년간 3%로 수렴, 영구성장 2.5%, 할인율 7%+베타×2.5%) + 순현금. 할인율·영구성장률 민감도 표 제공. 내년 예상 이익이 줄면 기준 현금흐름도 그만큼 낮추고, 적자 전환 전망이면 적용 안 함" },
  { label: "동종업계 상대가치", weight: 30, how: "비교 기업의 EV/EBITDA·선행 PER 중앙값 적용 (이익이 없으면 EV/매출). 배수는 업종 기본값의 0.5~1.75배로 제한, 비교 기업이 부족하면 업종 기본 배수. 이익 감소 전망이면 선행 PER만 사용" },
  { label: "성장성 및 경쟁력", weight: 20, how: "매출 성장률·총이익률(가격결정력)·영업이익률로 적정 EV/매출 배수 산출. 반영 성장률 최대 30%(100% 넘는 급증은 내년 이익 증가로 확인되지 않으면 일회성으로 보고 5%), DCF·상대가치 평균의 1.5배가 상한. 이익 감소 전망이면 적용 안 함" },
  { label: "재무·사업 위험 조정", weight: 10, how: "부채 과다·FCF 적자·매출 감소·주식 희석·공매도·실적 악재만큼 가치를 할인 (위험 계수 0.6~1.05). 변동성은 DCF 할인율에 이미 반영해 중복 차감하지 않음" },
  { label: "최종 상한", weight: 0, how: "적정가는 현재가의 2배(+100%)를 넘지 않음 — 반등 목표로 현실적인 범위" },
];

export const HORIZON_GRADES = [
  { name: "단기 수익성 (1~4주) 100점", how: "기술적 분석 25 + 과거 과매도 뒤 4주 성과 25 + 손익비 15 + 1차 목표 도달 확률(과거 사례) 15 + 하락 성격 10 + 변동성·시장 국면 10" },
  { name: "장기 수익성 (3~12개월) 100점", how: "기준 적정가까지 상승 여력 25 + 보수적 적정가 대비 하방 여유 10 + 기업의 질(성장성·재무) 30 + 내년 이익 전망 10 + 주식 희석 5 + 과거 과매도 뒤 12개월 성과 20. 회피 신호·장기 보유 부적합이면 F" },
];

/** 최우선 원칙 */
export const FINAL_PRINCIPLE = "단기 반등에 실패해도 장기 보유할 만한 기업이어야 한다.";

export interface CheckItem {
  key: string;
  area: string;
  check: string;
  redFlag: string;
}

/** 종목 선별 체크리스트 (기술적 항목은 분석 화면에서 자동 판정) */
export const SELECTION_CHECKLIST: CheckItem[] = [
  { key: "growth", area: "성장", check: "최근 3~5년 매출 및 핵심 제품 성장률", redFlag: "핵심 제품 성장률의 구조적 둔화" },
  { key: "profit", area: "수익성", check: "영업이익률, 순이익의 질, FCF", redFlag: "순이익이 일회성 세금효과 등에 크게 의존" },
  { key: "balance", area: "재무", check: "현금, 부채, 만기, 인수대금·우발채무", redFlag: "현금 소진 또는 과도한 차입·희석" },
  { key: "moat", area: "경쟁력", check: "제품 차별성, 시장점유율, 전환비용, 규제·보험급여", redFlag: "경쟁사에 점유율을 빼앗기거나 채택률 하락" },
  { key: "value", area: "가치평가", check: "DCF, PER, EV/EBITDA, EV/Sales 교차 검증", redFlag: "낙관적 가정에서만 현재가치가 정당화됨" },
  { key: "catalyst", area: "하락 원인", check: "이번 하락이 일시적 악재인지, 펀더멘털 훼손인지", redFlag: "가이던스 하향·핵심 사업 구조 변화" },
];

export const PRETRADE_CHECKLIST = [
  { key: "scorecard", text: "이중 투자전략 평가를 확인했고, 단기 반등에 실패해도 장기 보유할 만한 기업이다." },
  { key: "redflag", text: "하락 원인이 매출 감소·현금흐름 악화·경쟁력 상실이 아님을 확인했다." },
  { key: "price", text: "실시간 가격과 내 평균 매수가를 확인했다." },
  { key: "plan", text: "목표가, 보유 기간 제한, 손실 허용 범위(손절가)를 정했다." },
  { key: "tech", text: "RSI뿐 아니라 MACD, 거래량, 지지선, 이동평균선도 확인했다." },
  { key: "earnings", text: "최신 분기 실적과 가이던스에서 핵심 지표가 추가로 악화되지 않았는지 확인했다." },
  { key: "cashflow", text: "현금흐름에서 주식보상비용(SBC), 일회성 세금 효과, 인수 관련 현금 유출을 점검했다." },
  { key: "concentration", text: "이 거래 후 한 종목 비중이 과도하지 않은지 확인했다." },
  { key: "etp", text: "레버리지·인버스·변동성 상품이라면 추종 방식(선물, 일일 재설정)을 이해했다." },
  { key: "average", text: "추가 매수는 가격 하락만으로 결정하지 않고, 투자 논리가 유지될 때만 실행한다." },
];

export const GLOSSARY: { term: string; meaning: string }[] = [
  { term: "RSI", meaning: "최근 가격 상승·하락 강도를 0~100으로 나타내는 모멘텀 지표. 흔히 30 이하를 과매도로 보지만 반등을 보장하지 않는다." },
  { term: "MACD", meaning: "이동평균의 차이를 이용해 추세와 모멘텀 변화를 살펴보는 지표. 히스토그램이 음수에서 개선되면 하락 모멘텀 약화로 본다." },
  { term: "FCF", meaning: "잉여현금흐름. 영업활동 현금흐름에서 설비투자 등을 차감해 주주·채권자에게 남는 현금." },
  { term: "SBC", meaning: "주식보상비용. 현금 유출이 적더라도 주식 희석이라는 경제적 비용을 발생시킬 수 있다." },
  { term: "콘탱고", meaning: "먼 만기의 선물가격이 가까운 만기보다 높은 선물곡선 구조. 인버스 VIX 상품에 유리한 환경." },
  { term: "백워데이션", meaning: "가까운 만기의 선물가격이 먼 만기보다 높은 구조. 변동성 급등기에 나타나며 인버스 VIX 상품에 불리." },
  { term: "평균회귀", meaning: "극단적으로 벗어난 값이 장기 평균 방향으로 되돌아가는 경향. 시점과 폭을 보장하지 않는다." },
  { term: "DCF", meaning: "미래 현금흐름을 할인해 현재가치를 추정하는 방법. 가정에 매우 민감한 참고 시나리오다." },
];

/** 한 종목 비중 경고선 (%) */
export const CONCENTRATION_LIMIT = 40;

/** 레버리지·인버스·변동성 ETP — 해당 종목에 특별 경고를 띄운다 */
export const VOLATILITY_ETP = new Set(["SVIX", "SVXY", "UVXY", "UVIX", "VXX", "VIXY", "VIXM"]);
export const LEVERAGED_ETP = new Set([
  "TQQQ", "SQQQ", "SOXL", "SOXS", "UPRO", "SPXU", "SPXL", "SPXS", "TNA", "TZA", "LABU", "LABD",
  "TECL", "TECS", "FNGU", "FNGD", "NVDL", "TSLL", "TSLQ", "UDOW", "SDOW", "QLD", "SSO", "SDS", "QID",
]);

export function etpKind(symbol: string): "volatility" | "leveraged" | null {
  const s = symbol.toUpperCase();
  if (VOLATILITY_ETP.has(s)) return "volatility";
  if (LEVERAGED_ETP.has(s)) return "leveraged";
  return null;
}

export const VOL_ETP_NOTES = [
  "현물 VIX를 직접 추종하지 않는다. 단기 VIX 선물 지수의 일일 수익률(또는 역방향)을 추종한다.",
  "현물 VIX가 평균으로 돌아간다고 해서 상품 가격이 특정 수준까지 반드시 움직이는 것은 아니다.",
  "선물 만기 구조(콘탱고·백워데이션), 일일 재설정과 복리 효과가 수익률에 영향을 준다.",
  "VIX 평균회귀는 역사적 경향일 뿐, 특정 시점에 특정 수준으로 돌아간다는 약속이 아니다.",
  "변동성 급등 시 하루에 큰 폭으로 움직일 수 있다. 자산 대부분을 집중하면 포트폴리오 위험이 매우 높다.",
];

export const LEV_ETP_NOTES = [
  "일일 수익률의 배수를 추종하므로 며칠 이상 보유하면 기초지수 수익률의 단순 배수와 달라진다.",
  "횡보·변동이 큰 구간에서는 복리 효과로 가치가 깎일 수 있다(변동성 손실).",
  "장기 보유 근거로 펀더멘털을 쓸 수 없는 상품이다. 보유 기간 제한과 손절 기준이 특히 중요하다.",
];

/** '예시 데이터' — 2026-11-11 전략 문서 기준 값. 실시간 시세 아님. */
export const SAMPLE_DATA: AppData = {
  version: 1,
  cash: 0,
  positions: [
    {
      id: "sample-svix",
      symbol: "SVIX",
      shares: 14,
      avgCost: 21.8,
      target: 26,
      thesis: "VIX가 장기 평균(약 17)으로 회귀할 것이라는 방향성 거래.",
      invalidation: "VIX와 선물 가격이 다시 급등하거나 SVIX가 평균 매수가 아래로 내려가면 논리 재검토.",
    },
  ],
  watchlist: [
    {
      id: "sample-vcyt",
      symbol: "VCYT",
      note: "Decipher 검사량 둔화·2027 가이던스 하향으로 하락. 장기 논리는 Decipher 회복·Afirma 성장·현금흐름의 질에 달림.",
      zones: [
        { id: "z1", label: "관찰 구간", low: 23, high: 24, condition: "하락 진정 및 거래량 안정 확인" },
        { id: "z2", label: "1차 관심 구간", low: 21.5, high: 22.5, condition: "직전 저점 부근 지지·종가 회복 확인" },
        { id: "z3", label: "2차 관심 구간", low: 19, high: 20, condition: "추가 하락 원인이 펀더멘털 훼손인지 재검증" },
      ],
    },
    { id: "sample-ffiv", symbol: "FFIV", note: "좋은 회사 ≠ 좋은 매수가격. 단순 DCF 기본가치 약 $323 (11/11 기준).", zones: [] },
    { id: "sample-pypl", symbol: "PYPL", note: "RSI 40대는 과매도가 아님 — 실제 RSI와 기준일 확인 후 분류.", zones: [] },
  ],
  research: {},
  pretrade: {},
};
