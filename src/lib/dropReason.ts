// 하락 이유 분석 (서버·클라이언트 공용 순수 함수)
// 1) 언제·얼마나 떨어졌나  2) 실적 발표 직후인가  3) 시장·업종 탓인가 개별 악재인가  4) 뉴스로 원인 분류
import type { Bar, NewsItem, Tone } from "./types";

export type TagKind = "fundamental" | "analyst" | "external" | "event" | "positive";

export interface TagDef {
  key: string;
  label: string;
  kind: TagKind;
  re: RegExp;
  flag?: "revenue" | "cashflow" | "moat";
}

// 순서 중요: 앞에 있는 규칙이 우선 표시됨
export const TAGS: TagDef[] = [
  { key: "bankrupt", label: "파산·상장폐지 위험", kind: "fundamental", re: /bankrupt|chapter 11|delist|going concern/, flag: "cashflow" },
  { key: "revenue", label: "매출 감소", kind: "fundamental", re: /(revenue|sales) (decline|drop|fall|plunge|slump)|declin(e|ing) (in )?(revenue|sales)|lower (revenue|sales)/, flag: "revenue" },
  { key: "guidance", label: "가이던스 하향", kind: "fundamental", re: /(cut|cuts|lower|lowers|lowered|reduce|reduces|slash|slashes|trim|trims|withdraw|narrow|narrows|narrower|narrowed)s? .{0,25}(guidance|outlook|forecast)|(guidance|outlook|forecast).{0,25}(cut|lowered|below|reduced|weak|disappoint)/ },
  { key: "miss", label: "실적 부진", kind: "fundamental", re: /\bmiss(es|ed)?\b|falls? short|below (estimates|expectations|consensus)|disappoint|weak(er)? (results|quarter|earnings)|loss widen/ },
  { key: "slowdown", label: "성장 둔화", kind: "fundamental", re: /slow(er|ing|down|s)\b|decelerat|reset .{0,20}growth|growth (concern|worr|slows)|demand (weak|slow|soft)|soft(er)? demand|volume (shortfall|miss)/ },
  { key: "competition", label: "경쟁 심화", kind: "fundamental", re: /competit|market share|\brival|lost (contract|customer)|share loss|disrupt/, flag: "moat" },
  { key: "cash", label: "현금흐름 우려", kind: "fundamental", re: /cash burn|liquidity (concern|crunch)|cash flow (decline|negative|concern)|debt (concern|default)/, flag: "cashflow" },
  { key: "dilution", label: "증자·주식 희석", kind: "event", re: /offering|dilut|private placement|convertible (notes|senior)|at-the-market|share sale/ },
  { key: "legal", label: "소송·규제", kind: "event", re: /lawsuit|class action|investigat|probe|subpoena|\bsec (charges|inquiry)|recall|antitrust|fine[ds]?\b|penalt/ },
  { key: "fda", label: "임상·허가 악재", kind: "event", re: /fda (reject|warning|declin)|complete response letter|\bcrl\b|trial (fail|miss|halt)|fail(s|ed)? to meet|primary endpoint|clinical hold/ },
  { key: "mgmt", label: "경영진 리스크", kind: "event", re: /\b(ceo|cfo|chief executive|founder)\b.{0,40}(resign|step|depart|exit|leave|oust|replace|fate|allegation|scandal|remov)|(oust|remove|replace|fire|fate of).{0,40}\b(ceo|cfo|chief executive)|steps? down|misconduct|affair allegation/ },
  { key: "macro", label: "시장·업종 전반 약세", kind: "external", re: /stocks? (fall|slide|drop|tumble|sink|slump)|sell-?off|market (rout|slump|turmoil)|tariff|rate (hike|fear)|yields? (rise|jump|surge)|sector (slump|weak|rout)/ },
  { key: "positive", label: "호재", kind: "positive", re: /\bbeats?\b|tops (estimates|expectations)|raises? (guidance|outlook|forecast)|record (revenue|quarter|sales)|\bsurges?\b|\bsoars?\b|\bjumps?\b|approval|approved/ },
];

/** 애널리스트 의견·목표가 기사 — 판단에 쓰지 않으므로 분류에서 제외 */
const ANALYST_RE = /price target|downgrad|upgrad|initiat(es|ed) coverage|reiterat|maintains .{0,20}rating|analyst/i;

export function tagHeadline(title: string): TagDef[] {
  if (ANALYST_RE.test(title)) return [];
  const t = title.toLowerCase();
  const tags = TAGS.filter((d) => d.re.test(t));
  // 부정 태그가 있으면 '호재' 표시는 생략 (예: "beats but cuts guidance")
  if (tags.some((x) => x.kind !== "positive")) return tags.filter((x) => x.kind !== "positive");
  return tags;
}

export interface TaggedNews extends NewsItem {
  tags: { key: string; label: string; kind: TagKind }[];
}

export interface DropEvent {
  time: number;
  changePct: number;
  volMultiple: number | null;
  afterEarnings: boolean;
  news: TaggedNews[];
}

export interface Benchmark {
  label: string; // "S&P 500" / "헬스케어 업종(XLV)"
  ret1m: number | null;
  ret3m: number | null;
}

export interface DropAnalysis {
  high3m: number;
  high3mTime: number;
  fromHigh3m: number; // %
  ret1m: number | null;
  ret3m: number | null;
  market: Benchmark | null;
  sector: Benchmark | null;
  relative: "idiosyncratic" | "market" | "mixed" | "none";
  events: DropEvent[];
  recentNews: TaggedNews[];
  tagCounts: { key: string; label: string; kind: TagKind; count: number }[];
  nature: "fundamental" | "earnings" | "event" | "external" | "unclear" | "none";
  natureLabel: string;
  natureTone: Tone;
  bullets: string[];
  suggestedFlags: Partial<Record<"revenue" | "cashflow" | "moat", string>>; // 근거 헤드라인
}

export function periodReturn(bars: Bar[], days: number): number | null {
  if (bars.length <= days) return null;
  const a = bars[bars.length - 1 - days].close;
  const b = bars[bars.length - 1].close;
  return a > 0 ? ((b - a) / a) * 100 : null;
}

const DAY = 86400;
const fmtDate = (t: number) =>
  new Date(t * 1000).toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "America/New_York" });
const p = (n: number | null, d = 1) => (n == null ? "–" : `${n > 0 ? "+" : ""}${n.toFixed(d)}%`);

export function analyzeDrop(
  bars: Bar[],
  news: NewsItem[],
  opts: { earningsDate?: number | null; market?: Benchmark | null; sector?: Benchmark | null } = {},
): DropAnalysis {
  const last63 = bars.slice(-63);
  let hi = last63[0];
  for (const b of last63) if (b.high > hi.high) hi = b;
  const price = bars[bars.length - 1].close;
  const fromHigh3m = ((price - hi.high) / hi.high) * 100;
  const ret1m = periodReturn(bars, 21);
  const ret3m = periodReturn(bars, 63);

  const tagged: TaggedNews[] = news
    .filter((n) => !ANALYST_RE.test(n.title)) // 애널리스트 의견 기사 제외
    .map((n) => ({ ...n, tags: tagHeadline(n.title).map(({ key, label, kind }) => ({ key, label, kind })) }))
    .sort((a, b) => b.time - a.time);

  // 급락일: 최근 63거래일 중 -4% 이하, 큰 순서 3개
  const vol20 = (i: number) => {
    const s = bars.slice(Math.max(0, i - 20), i);
    return s.length ? s.reduce((a, b) => a + b.volume, 0) / s.length : 0;
  };
  const start = Math.max(1, bars.length - 63);
  const candidates: { i: number; chg: number }[] = [];
  for (let i = start; i < bars.length; i++) {
    const chg = ((bars[i].close - bars[i - 1].close) / bars[i - 1].close) * 100;
    if (chg <= -4) candidates.push({ i, chg });
  }
  candidates.sort((a, b) => a.chg - b.chg);
  const ed = opts.earningsDate ?? null;
  const events: DropEvent[] = candidates.slice(0, 3).map(({ i, chg }) => {
    const t = bars[i].time;
    const v = vol20(i);
    return {
      time: t,
      changePct: chg,
      volMultiple: v > 0 && bars[i].volume > 0 ? bars[i].volume / v : null,
      // 실적 발표 당일~3일 뒤 하락이면 실적 반응으로 본다
      afterEarnings: ed != null && t >= ed - DAY && t <= ed + 4 * DAY,
      news: tagged.filter((n) => n.time >= t - 3 * DAY && n.time <= t + 2 * DAY).slice(0, 4),
    };
  });
  events.sort((a, b) => b.time - a.time);

  // 시장·업종 대비
  const cmp = opts.sector?.ret3m ?? opts.market?.ret3m ?? null;
  const mkt = opts.market?.ret3m ?? null;
  let relative: DropAnalysis["relative"] = "none";
  if (ret3m != null && ret3m < -5) {
    const gap = ret3m - (cmp ?? 0);
    if (cmp != null && cmp <= ret3m * 0.5) relative = "market";
    else if (gap <= -12) relative = "idiosyncratic";
    else relative = "mixed";
  }

  // 원인 태그 집계 (최근 45일 뉴스)
  const recent = tagged.filter((n) => n.time >= Date.now() / 1000 - 45 * DAY);
  const counts = new Map<string, { key: string; label: string; kind: TagKind; count: number }>();
  for (const n of recent) for (const t of n.tags) {
    const c = counts.get(t.key) ?? { ...t, count: 0 };
    c.count++;
    counts.set(t.key, c);
  }
  const tagCounts = Array.from(counts.values()).sort(
    (a, b) => TAGS.findIndex((x) => x.key === a.key) - TAGS.findIndex((x) => x.key === b.key),
  );
  const neg = tagCounts.filter((t) => t.kind !== "positive");

  const suggestedFlags: DropAnalysis["suggestedFlags"] = {};
  for (const n of recent) for (const t of n.tags) {
    const def = TAGS.find((x) => x.key === t.key);
    if (def?.flag && !suggestedFlags[def.flag]) suggestedFlags[def.flag] = n.title;
  }

  // 하락 성격
  let nature: DropAnalysis["nature"] = "none";
  let natureLabel = "뚜렷한 하락 없음";
  let natureTone: Tone = "neutral";
  if (fromHigh3m > -10 && events.length === 0) {
    nature = "none";
  } else if (neg.some((t) => t.kind === "fundamental")) {
    nature = "fundamental";
    natureLabel = "기업 실적·성장 관련 악재";
    natureTone = "bad";
  } else if (events.some((e) => e.afterEarnings && e.changePct <= -8)) {
    nature = "earnings";
    natureLabel = "실적 발표 후 급락 — 실적 내용 확인 필요";
    natureTone = "bad";
  } else if (neg.some((t) => t.kind === "event")) {
    nature = "event";
    natureLabel = "개별 이벤트성 악재";
    natureTone = "warn";
  } else if (relative === "market" || neg.some((t) => t.kind === "external")) {
    nature = "external";
    natureLabel = "시장·업종 전반 영향";
    natureTone = "good";
  } else {
    nature = "unclear";
    natureLabel = "원인 불명확 — 직접 확인 필요";
    natureTone = "warn";
  }

  // 설명 문장
  const bullets: string[] = [];
  bullets.push(`최근 3개월 고점(${fmtDate(hi.time)}, $${hi.high.toFixed(2)}) 대비 ${p(fromHigh3m)}. 1개월 ${p(ret1m)}, 3개월 ${p(ret3m)}.`);
  for (const e of events) {
    const parts = [`${fmtDate(e.time)} 하루 ${p(e.changePct)} 급락`];
    if (e.volMultiple && e.volMultiple >= 1.5) parts.push(`거래량 평소의 ${e.volMultiple.toFixed(1)}배`);
    let s = parts.join(" · ");
    if (e.afterEarnings) s += " — 실적 발표 직후 하락";
    const labels = Array.from(new Set(e.news.flatMap((n) => n.tags.filter((t) => t.kind !== "positive").map((t) => t.label))));
    if (labels.length) s += ` (관련 뉴스: ${labels.join(", ")})`;
    bullets.push(s + ".");
  }
  if (opts.market || opts.sector) {
    const cmpTxt = [opts.market && `${opts.market.label} ${p(mkt)}`, opts.sector && `${opts.sector.label} ${p(opts.sector.ret3m)}`]
      .filter(Boolean)
      .join(", ");
    const verdict =
      relative === "idiosyncratic"
        ? "시장이 아니라 이 종목 고유의 악재로 떨어졌습니다."
        : relative === "market"
          ? "시장·업종 전체가 함께 떨어진 영향이 큽니다."
          : relative === "mixed"
            ? "시장 약세와 개별 요인이 섞여 있습니다."
            : "";
    bullets.push(`같은 3개월 동안 ${cmpTxt}.${verdict ? " " + verdict : ""}`);
  }
  if (neg.length) {
    bullets.push(`최근 뉴스에서 확인된 하락 요인: ${neg.map((t) => t.label).join(", ")}.`);
  } else if (fromHigh3m <= -10) {
    bullets.push("최근 뉴스 제목에서는 뚜렷한 악재 키워드가 확인되지 않았습니다. 공시와 실적 자료를 직접 확인하세요.");
  }
  if (nature === "earnings") {
    bullets.push("실적 발표 직후 크게 떨어졌습니다. 시장이 실적이나 가이던스에 실망했다는 뜻이므로, 매출·현금흐름이 꺾였는지 실적 자료로 확인하세요.");
  }
  if (nature === "fundamental") {
    bullets.push("기업 자체의 실적·성장 문제가 포함되어 있습니다. 일시적인지, 매출 감소·현금흐름 악화·경쟁력 상실로 이어지는지 확인해야 합니다.");
  }

  return {
    high3m: hi.high,
    high3mTime: hi.time,
    fromHigh3m,
    ret1m,
    ret3m,
    market: opts.market ?? null,
    sector: opts.sector ?? null,
    relative,
    events,
    recentNews: tagged.slice(0, 10),
    tagCounts,
    nature,
    natureLabel,
    natureTone,
    bullets,
    suggestedFlags,
  };
}
