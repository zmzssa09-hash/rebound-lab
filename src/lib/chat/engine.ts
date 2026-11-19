// 서버 전용: AI 종목 상담
// 1) 질문 → 검색 조건(JSON): AI가 만들고, AI를 못 쓰면 규칙으로 만든다
// 2) 검색 조건 → 사이트 데이터에서 종목 찾기 (최근 전체 분석 결과 + 종목 직접 분석)
// 3) 찾은 데이터만 주고 AI가 설명을 쓴다. 숫자는 화면의 종목 카드가 데이터에서 그대로 보여준다.
import { withLive } from "../live";
import { HANGUL_RE, searchKorean } from "../naver";
import { getResult, pickForSymbol } from "../scanner";
import { GLOSSARY } from "../strategy";
import { actionOf, ZONE_INFO, zoneOf } from "../tradePlan";
import type { Pick } from "../types";
import { searchSymbols } from "../yahoo";
import { complete, LlmUnavailable, parseJson, type LlmMessage } from "./llm";

export const SECTORS = ["기술", "커뮤니케이션", "경기소비재", "필수소비재", "헬스케어", "금융", "산업재", "에너지", "소재", "부동산", "유틸리티"];
const GRADES = ["S+", "S", "A+", "A", "B+", "B", "C+", "C", "D+", "D", "F"];
const SORTS = ["score", "upside", "rsi", "drop", "price"] as const;

export interface ChatPlan {
  intent: "stock" | "screen" | "learn" | "other";
  stocks: string[]; // 질문에 나온 종목 (티커 또는 이름)
  guesses?: string[]; // AI 없는 검색: 종목 이름일 수도 있는 한글 단어 (정확히 맞을 때만 종목으로 인정)
  sector: string | null;
  minGrade: string | null;
  topOnly: boolean; // 추천 Top 10만
  buyZoneOnly: boolean; // 지금 매수 구간(적극·분할)만
  excludedOnly: boolean; // 걸러낸(제외된) 종목만
  maxPrice: number | null;
  sort: (typeof SORTS)[number];
  limit: number;
}

export interface ChatCard {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  changePct: number | null;
  rsi: number | null;
  grade: string | null;
  total: number;
  fairValue: number | null;
  upside: number | null; // 적정가까지 %
  zone: string | null;
  action: string | null;
  stop: number | null;
  t1: number | null;
  rank: number | null; // Top 10 순위
  excludeReason: string | null;
  dropNature: string;
  oversold: boolean;
}

export interface ChatReply {
  answer: string;
  cards: ChatCard[];
  plan: ChatPlan;
  ai: string | null; // 답을 쓴 AI (없으면 AI 없는 검색)
  scannedAt: number | null;
}

// ───────── 1) 질문 → 검색 조건 ─────────

const PLAN_SYSTEM = `너는 미국 주식 추천 사이트 '리바운드 랩'의 검색 도우미다. 사용자의 질문(이전 대화 포함)을 검색 조건 JSON으로만 바꿔라. 설명은 쓰지 마라.
사이트 데이터: 최근 많이 떨어진(과매도, RSI 30 이하) 미국 주식 약 200개를 분석한 결과 — 100점 점수, 등급(S+~F), 업종, 적정가, 매수 구간, 손절가, 하락 이유, 추천 Top 10, 회피 신호 등으로 걸러낸 종목.
JSON 형식:
{"intent":"stock|screen|learn|other","stocks":[],"sector":null,"minGrade":null,"topOnly":false,"buyZoneOnly":false,"excludedOnly":false,"maxPrice":null,"sort":"score","limit":5}
- intent: 특정 종목을 묻는다=stock, 조건으로 종목을 찾는다=screen, 용어·사용법·투자 개념을 묻는다=learn, 그 밖=other
- stocks: 질문에 나온 종목의 미국 티커(알면 티커, 모르면 이름 그대로, 최대 3개). "그거", "첫 번째 종목"처럼 이전 대화를 가리키면 이전 대화의 종목을 넣어라.
- sector: ${SECTORS.join(", ")} 중 하나 또는 null (반도체·소프트웨어·IT=기술, 바이오·제약=헬스케어, 은행·보험=금융, 석유=에너지, 통신·미디어=커뮤니케이션, 자동차·유통·여행=경기소비재)
- minGrade: ${GRADES.join(", ")} 중 하나 또는 null ("좋은 종목", "추천할 만한"은 topOnly=true)
- buyZoneOnly: "지금 살 만한", "매수 구간" 등
- excludedOnly: "걸러낸", "제외된", "위험한", "피해야 할" 종목
- maxPrice: 달러 기준 최고 주가 (예: "50달러 이하" → 50)
- sort: score(점수 높은 순, 기본), upside(적정가 대비 싼 순), rsi(가장 과매도), drop(가장 많이 떨어진), price(주가 낮은 순)
- limit: 1~8 (기본 5)
한국 주식은 다루지 않는다(intent=other).`;

function normalizePlan(p: Partial<ChatPlan> | null): ChatPlan {
  const n = (v: unknown) => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
  return {
    intent: (["stock", "screen", "learn", "other"] as const).includes(p?.intent as never) ? p!.intent! : "screen",
    stocks: Array.isArray(p?.stocks) ? p!.stocks.filter((s) => typeof s === "string" && s.trim()).slice(0, 3) : [],
    sector: SECTORS.includes(p?.sector ?? "") ? p!.sector! : null,
    minGrade: GRADES.includes(p?.minGrade ?? "") ? p!.minGrade! : null,
    topOnly: p?.topOnly === true,
    buyZoneOnly: p?.buyZoneOnly === true,
    excludedOnly: p?.excludedOnly === true,
    maxPrice: n(p?.maxPrice),
    sort: SORTS.includes(p?.sort as never) ? p!.sort! : "score",
    limit: Math.min(8, Math.max(1, Math.round(n(p?.limit) ?? 5))),
  };
}

const SECTOR_WORDS: [RegExp, string][] = [
  [/기술|IT|반도체|소프트웨어|테크|AI|인공지능|클라우드/i, "기술"],
  [/헬스케어|바이오|제약|의료|병원/, "헬스케어"],
  [/금융|은행|보험|증권|카드/, "금융"],
  [/에너지|석유|오일|가스/, "에너지"],
  [/통신|미디어|커뮤니케이션|게임|엔터/, "커뮤니케이션"],
  [/필수소비재|식품|음료|생활용품/, "필수소비재"],
  [/경기소비재|자동차|유통|여행|소매|의류/, "경기소비재"],
  [/산업재|항공|방산|기계|운송|물류/, "산업재"],
  [/소재|화학|철강|금속|광산/, "소재"],
  [/부동산|리츠|REIT/i, "부동산"],
  [/유틸리티|전력|전기|수도/, "유틸리티"],
];
const STOP_WORDS = new Set(["RSI", "ETF", "IT", "AI", "TOP", "S", "A", "B", "C", "D", "F", "PER", "PBR", "FCF", "USD", "KRW", "MACD", "REIT", "OK"]);

/** AI 없이 규칙으로 검색 조건 만들기 */
export function ruleBasedPlan(q: string): ChatPlan {
  const plan = normalizePlan({});
  for (const [re, sec] of SECTOR_WORDS)
    if (re.test(q)) {
      plan.sector = sec;
      break;
    }
  const g = q.match(/([SABCDF]\+?)\s*등급/i);
  if (g) plan.minGrade = g[1].toUpperCase();
  if (/추천|좋은|괜찮은|best|탑|top/i.test(q)) plan.topOnly = true;
  if (/매수\s*구간|살\s*만|사도|지금\s*사|매수할/.test(q)) plan.buyZoneOnly = true;
  if (/걸러|제외|위험|피해야|회피/.test(q)) {
    plan.excludedOnly = true;
    plan.topOnly = false;
  }
  const mp = q.match(/(\d+(?:\.\d+)?)\s*(?:달러|\$|불)\s*(?:이하|미만|아래|밑)/) ?? q.match(/\$\s*(\d+(?:\.\d+)?)\s*(?:이하|미만|아래)/);
  if (mp) plan.maxPrice = Number(mp[1]);
  if (/싼|저평가|할인|싸게/.test(q)) plan.sort = "upside";
  else if (/많이\s*떨어|폭락|급락|하락\s*큰/.test(q)) plan.sort = "drop";
  else if (/과매도/.test(q)) plan.sort = "rsi";
  else if (/저가|싼\s*주식|주가\s*낮/.test(q)) plan.sort = "price";
  const lim = q.match(/(\d+)\s*(?:개|종목|가지)/);
  if (lim) plan.limit = Math.min(8, Math.max(1, Number(lim[1])));
  // 종목: 영문 티커
  for (const t of q.match(/\b[A-Z]{1,5}(?:[.-][A-Z])?\b/g) ?? []) if (!STOP_WORDS.has(t)) plan.stocks.push(t);
  // 종목: 한글 이름 (조건 단어를 뺀 나머지)
  if (HANGUL_RE.test(q)) {
    const words = q
      .replace(/[?!.,~]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/(은|는|이|가|을|를|도|만|의|에|에서|이랑|랑|하고|주|어때|어때요|어떄|좀|는요)$/u, ""))
      .filter((w) => w.length >= 2 && HANGUL_RE.test(w) && !/\d/.test(w))
      .filter((w) => !SECTOR_WORDS.some(([re]) => re.test(w)) && !/추천|종목|주식|매수|구간|지금|사도|떨어|등급|적정가|과매도|좋은|괜찮|싼|이하|달러|알려|찾아|보여|뭐|어떤|무슨|오늘|요즘|최근|돼|될까|할까|위험|제외|걸러|있어|있나|만한|이상|미만|아래|중에|중에서|해줘|줘|가장|제일|많이|정도|얼마|그냥|혹시|어디|언제|왜|뭘|살까|팔까|해도|하면|좋을|나을/.test(w));
    plan.guesses = [...new Set(words)].slice(0, 3);
  }
  plan.stocks = [...new Set(plan.stocks)].slice(0, 3);
  if (/뜻|뭐야|무엇|란\b|이란|의미|설명해|어떻게\s*(봐|읽|사용)/.test(q) && !plan.stocks.length) plan.intent = "learn";
  else if (plan.stocks.length || plan.guesses?.length) plan.intent = "stock";
  return plan;
}

// ───────── 2) 검색 조건 → 데이터 ─────────

async function resolveSymbol(s: string, strict = false): Promise<string | null> {
  const t = s.trim();
  if (strict) {
    if (!HANGUL_RE.test(t)) return null;
    const hits = await searchKorean(t).catch(() => []);
    const k = t.replace(/\s/g, "");
    const norm = (n: string) => n.replace(/\s/g, "");
    return hits.find((h) => norm(h.nameKo) === k)?.symbol ?? (k.length >= 3 ? hits.find((h) => norm(h.nameKo).startsWith(k))?.symbol : null) ?? null;
  }
  if (/^[A-Za-z]{1,5}([.-][A-Za-z])?$/.test(t)) return t.toUpperCase().replace(".", "-");
  try {
    if (HANGUL_RE.test(t)) {
      const hits = await searchKorean(t);
      const exact = hits.find((h) => h.nameKo.replace(/\s/g, "") === t.replace(/\s/g, "")) ?? hits.find((h) => h.nameKo.includes(t));
      return (exact ?? (t.length >= 3 ? hits[0] : null))?.symbol ?? null;
    }
    const y = await searchSymbols(t);
    return y.find((h) => h.type === "EQUITY")?.symbol ?? y[0]?.symbol ?? null;
  } catch {
    return null;
  }
}

const BUY_ACTIONS = new Set(["적극 매수 검토", "분할 매수"]);

function cardOf(p: Pick): ChatCard {
  const price = p.live?.price ?? p.price;
  const zone = p.plan?.zones ? zoneOf(p.plan.zones, price) : null;
  const act = p.plan
    ? actionOf({
        blocked: p.excluded ? (p.excludeReason ?? "추천 조건 탈락") : (p.blocked ?? null),
        zone,
        price,
        stop: p.plan.stop?.price ?? null,
        rr: p.plan.rr,
        shortScore: p.shortGrade?.score ?? null,
        earningsAt: p.earningsDate ?? null,
      }).title
    : null;
  const rsi = p.live?.rsi ?? p.rsi;
  return {
    symbol: p.symbol,
    name: p.nameKo ?? p.name,
    sector: p.sectorKo,
    price,
    changePct: p.live?.changePct ?? p.changePct,
    rsi,
    grade: p.gradeLetter ?? null,
    total: Math.round(p.live?.total ?? p.total),
    fairValue: p.fairValue,
    upside: p.fairValue ? (p.fairValue / price - 1) * 100 : null,
    zone: zone ? ZONE_INFO[zone].label : null,
    action: act,
    stop: p.plan?.stop?.price ?? null,
    t1: p.plan?.t1?.price ?? null,
    rank: p.rank ?? null,
    excludeReason: p.excludeReason,
    dropNature: p.dropNatureLabel,
    oversold: rsi != null && rsi <= 30,
  };
}

/** AI에게 줄 종목 요약 (화면 카드보다 자세히) */
function brief(p: Pick, c: ChatCard) {
  return {
    ...c,
    upside: c.upside != null ? Math.round(c.upside) : null,
    rsi: c.rsi != null ? Math.round(c.rsi) : null,
    confidence: p.confidence?.label ?? null,
    bearValue: p.scenarios?.bear ?? null,
    shortTerm: p.shortGrade ? `${p.shortGrade.grade} ${p.shortGrade.label}` : null,
    longTerm: p.longGrade ? `${p.longGrade.grade} ${p.longGrade.label}` : null,
    longTermOk: p.longTermOk,
    redFlags: p.flags,
    dropReasons: p.dropBullets.slice(0, 3),
    fromHigh3m: Math.round(p.fromHigh3m),
    earningsDate: p.earningsDate && p.earningsDate * 1000 > Date.now() - 86_400_000 ? new Date(p.earningsDate * 1000).toLocaleDateString("ko-KR", { month: "long", day: "numeric" }) : null,
    t1Pct: p.plan?.t1?.pct != null ? Math.round(p.plan.t1.pct) : null,
    stopPct: p.plan?.stop?.pct != null ? Math.round(p.plan.stop.pct) : null,
    rr: p.plan?.rr != null ? Number(p.plan.rr.toFixed(1)) : null,
  };
}

async function findData(plan: ChatPlan) {
  const r = await getResult();
  const picks = r?.picks ?? [];
  const top = r?.top ?? [];
  const topBy = new Map(top.map((p) => [p.symbol, p]));
  const merged = picks.map((p) => topBy.get(p.symbol) ?? p); // Top 10은 순위 정보가 있는 쪽

  let found: Pick[] = [];
  const notFound: string[] = [];
  const wanted: { s: string; strict: boolean }[] = [...plan.stocks.map((s) => ({ s, strict: false })), ...(plan.guesses ?? []).map((s) => ({ s, strict: true }))];
  if (wanted.length) {
    for (const { s, strict } of wanted.slice(0, 3)) {
      const sym = await resolveSymbol(s, strict);
      if (!sym) {
        if (!strict) notFound.push(s);
        continue;
      }
      const known = merged.find((p) => p.symbol === sym);
      const p = known ?? (await pickForSymbol(sym).catch(() => null));
      if (p) found.push(p);
      else notFound.push(s);
    }
  }
  // 종목 이름이 하나도 맞지 않은 AI 없는 검색 → 조건 검색으로
  if (!found.length && !plan.stocks.length && plan.guesses?.length) plan.intent = "screen";
  if (!found.length && !notFound.length && (plan.intent === "screen" || plan.intent === "other")) {
    const gi = (g: string | null | undefined) => (g ? GRADES.indexOf(g) : 99);
    let list = plan.topOnly ? [...top] : merged;
    list = list.filter((p) => (plan.excludedOnly ? p.excluded : plan.topOnly ? true : !p.excluded));
    if (plan.sector) list = list.filter((p) => p.sectorKo === plan.sector);
    if (plan.minGrade) list = list.filter((p) => gi(p.gradeLetter) <= GRADES.indexOf(plan.minGrade!));
    if (plan.maxPrice) list = list.filter((p) => p.price <= plan.maxPrice!);
    // 매수 구간은 실시간 가격으로 다시 확인하므로 넉넉히 뽑아 둔다
    if (plan.buyZoneOnly)
      list = list.filter((p) => {
        const z = p.plan?.zones ? zoneOf(p.plan.zones, p.price * 0.97) : null;
        return !p.excluded && !p.blocked && (z === "aggressive" || z === "split");
      });
    const up = (p: Pick) => (p.fairValue ? p.fairValue / p.price - 1 : -9);
    const key: Record<ChatPlan["sort"], (p: Pick) => number> = {
      score: (p) => -(p.rankScore ?? p.total),
      upside: (p) => -up(p),
      rsi: (p) => p.rsi ?? 99,
      drop: (p) => p.fromHigh3m,
      price: (p) => p.price,
    };
    found = [...list].sort((a, b) => key[plan.sort](a) - key[plan.sort](b)).slice(0, plan.buyZoneOnly ? plan.limit * 3 : plan.limit);
    found = await withLive(found);
    if (plan.buyZoneOnly) found = found.filter((p) => BUY_ACTIONS.has(cardOf(p).action ?? ""));
    found = found.slice(0, plan.limit);
  } else found = await withLive(found);
  return { found, notFound, scannedAt: r?.scannedAt ?? null, poolSize: picks.length };
}

// ───────── 3) 답 쓰기 ─────────

const ANSWER_SYSTEM = `너는 미국 주식 추천 사이트 '리바운드 랩'의 상담원이다. 주식을 잘 모르는 초보자에게 한국어로 쉽고 짧게 답한다.
규칙:
- 숫자(가격·점수·적정가·손절가 등)는 반드시 아래 [사이트 데이터]에 있는 값만 쓴다. 데이터에 없는 숫자·뉴스·사실은 지어내지 말고 "사이트 데이터에 없다"고 말한다.
- "반드시 오른다", "무조건 사라" 같은 단정·보장은 하지 않는다. 판단은 사이트 규칙(매수 구간, 손절가, 실적 발표 전 매수 금지, 회피 신호)으로 안내한다.
- 종목마다 action 값(지금 해야 할 일)을 데이터 그대로 정확히 쓴다. 여러 종목을 한데 묶어 같은 action이라고 말하지 마라.
- earningsDate는 다가오는 실적 발표일이다(없으면 예정 없음/이미 지남). today를 기준으로 말한다.
- 종목마다 핵심만: 지금 해야 할 일(action), 왜 떨어졌는지(dropReasons/dropNature), 점수·등급, 적정가 대비 여유(upside), 손절가. 걸러낸 종목이면 excludeReason을 쉽게 풀어서 왜 피해야 하는지 말한다.
- 과매도(oversold=false)가 아닌 종목은 "지금은 사이트의 추천 대상(많이 떨어진 종목)이 아니다"라고 알려준다.
- 화면에 종목 카드가 따로 나오므로 표는 만들지 말고, 3~8문장 안에서 답한다. 강조는 **굵게**만 쓴다. 링크는 쓰지 않는다.
- 한국 주식, 코인, 개인 재무 상담 등 사이트 범위 밖이면 정중히 미국 주식 과매도 종목만 다룬다고 말한다.
- 마지막 문장에 투자 판단은 본인 책임이라는 말을 넣지 않는다(화면에 이미 있다).`;

function fallbackAnswer(q: string, plan: ChatPlan, cards: ChatCard[], notFound: string[]): string {
  const lines: string[] = [];
  if (notFound.length) lines.push(`"${notFound.join(", ")}" 종목을 찾지 못했습니다. 미국 주식 이름이나 티커(예: NVDA)로 다시 물어봐 주세요.`);
  if (plan.intent === "learn") {
    const hits = GLOSSARY.filter((g) => q.toLowerCase().includes(g.term.toLowerCase().split(/[\s(]/)[0]));
    if (hits.length) for (const g of hits.slice(0, 3)) lines.push(`**${g.term}**: ${g.meaning}`);
    else lines.push("용어 뜻은 화면 곳곳의 밑줄 친 용어에 마우스를 올리거나, '처음 오셨나요?' 안내에서 볼 수 있습니다.");
    return lines.join("\n");
  }
  if (!cards.length) {
    if (!notFound.length) lines.push("조건에 맞는 종목이 지금은 없습니다. 조건을 조금 넓혀서 다시 물어봐 주세요.");
    return lines.join("\n");
  }
  if (plan.intent === "stock") {
    for (const c of cards) {
      const parts = [`**${c.name}(${c.symbol})** ${c.grade ?? ""} ${c.total}점`];
      if (!c.oversold) parts.push("지금은 많이 떨어진 종목이 아니라 추천 대상이 아닙니다.");
      if (c.excludeReason) parts.push(`사이트 필터에서 제외: ${c.excludeReason}.`);
      else if (c.action) parts.push(`지금 할 일: **${c.action}**.`);
      if (c.rank) parts.push(`현재 추천 ${c.rank}위.`);
      lines.push(parts.join(" "));
    }
  } else {
    const what = [plan.sector && `${plan.sector} 업종`, plan.minGrade && `${plan.minGrade} 등급 이상`, plan.maxPrice && `$${plan.maxPrice} 이하`, plan.buyZoneOnly && "지금 매수 구간", plan.excludedOnly && "걸러낸"]
      .filter(Boolean)
      .join(" · ");
    lines.push(`${what ? `${what} ` : ""}종목 ${cards.length}개를 찾았습니다. 아래 카드를 눌러 자세한 분석을 확인하세요.`);
  }
  return lines.join("\n");
}

export async function answer(history: LlmMessage[]): Promise<ChatReply> {
  const q = history[history.length - 1]?.content ?? "";
  let ai: string | null = null;
  let plan: ChatPlan;
  try {
    const r = await complete({ system: PLAN_SYSTEM, messages: history.slice(-6), json: true, maxTokens: 250, temperature: 0 });
    plan = normalizePlan(parseJson<Partial<ChatPlan>>(r.text));
    ai = r.provider;
  } catch (e) {
    if (!(e instanceof LlmUnavailable)) console.error("AI 검색 조건 실패:", (e as Error).message);
    plan = ruleBasedPlan(q);
  }

  const { found, notFound, scannedAt, poolSize } = plan.intent === "learn" && !plan.stocks.length ? { found: [], notFound: [], scannedAt: null, poolSize: 0 } : await findData(plan);
  const cards = found.map(cardOf);

  if (ai) {
    try {
      const data = {
        question: q,
        today: new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric", weekday: "short" }),
        searchConditions: plan,
        analyzedAt: scannedAt ? new Date(scannedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : null,
        oversoldPoolSize: poolSize,
        notFound,
        note: !plan.stocks.length && found.length < plan.limit ? `검색 조건에 맞는 종목은 ${found.length}개가 전부다 (분석한 과매도 종목 ${poolSize}개 중)` : undefined,
        stocks: found.map((p, i) => brief(p, cards[i])),
        glossary: plan.intent === "learn" ? GLOSSARY : undefined,
      };
      const msgs: LlmMessage[] = [...history.slice(-6, -1), { role: "user", content: `${q}\n\n[사이트 데이터]\n${JSON.stringify(data)}` }];
      const r = await complete({ system: ANSWER_SYSTEM, messages: msgs, maxTokens: 700, temperature: 0.2 });
      return { answer: r.text.trim(), cards, plan, ai: r.provider, scannedAt };
    } catch (e) {
      console.error("AI 답변 실패:", (e as Error).message);
    }
  }
  return { answer: fallbackAnswer(q, plan, cards, notFound), cards, plan, ai: null, scannedAt };
}
