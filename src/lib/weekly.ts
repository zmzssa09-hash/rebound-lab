// 서버 전용: 주간 리포트
// 한 주의 마지막 정규장이 끝난 뒤(마감 확정 분석 때) 이번 주 추천 성적·모의투자·시장 국면·다음 주 실적 발표 일정을 정리한다.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { computeSnapshot } from "./analysis";
import { loadPaper, PAPER_START_CASH, paperSummary } from "./paper";
import { loadTrack, trackStats } from "./track";
import type { Pick } from "./types";
import { fetchChart } from "./yahoo";

const FILE = path.join(process.cwd(), ".data", "weekly.json");
const DAY = 86_400_000;

export interface WeeklyReport {
  id: string; // 주 시작일 YYYY-MM-DD
  createdAt: number;
  range: string; // "11월 17일 ~ 11월 21일"
  headline: string;
  market: { spyWeek: number | null; above200: boolean | null; above50: boolean | null; text: string };
  paper: { equity: number; week: number | null; total: number; spyTotal: number | null; buys: number; sells: number; realized: number } | null;
  track: { open: number; openAvg: number | null; openSpy: number | null; closedThisWeek: { name: string; symbol: string; ret: number; reason: string }[] };
  newPicks: { name: string; symbol: string; grade: string | null; total: number | null }[];
  top: { name: string; symbol: string; grade: string | null; total: number }[];
  earnings: { name: string; symbol: string; date: number }[]; // 다음 주 실적 발표 (UNIX초)
}

export async function loadWeekly(): Promise<WeeklyReport[]> {
  try {
    return JSON.parse(await readFile(FILE, "utf8")) as WeeklyReport[];
  } catch {
    return [];
  }
}

const md = (t: number) => new Date(t).toLocaleDateString("ko-KR", { timeZone: "America/New_York", month: "long", day: "numeric" });
const pc = (v: number | null) => (v == null ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);

export async function buildWeekly(top: Pick[], now = Date.now()): Promise<WeeklyReport> {
  const weekStart = now - 6 * DAY;
  const spyC = await fetchChart("SPY", "2y").catch(() => null);
  let spyWeek: number | null = null;
  let above200: boolean | null = null;
  let above50: boolean | null = null;
  let firstBar = weekStart;
  if (spyC) {
    const bars = spyC.bars;
    const idx = bars.findIndex((b) => b.time * 1000 >= weekStart - 12 * 3600_000);
    const base = idx > 0 ? bars[idx - 1].close : null;
    if (idx >= 0) firstBar = bars[idx].time * 1000;
    spyWeek = base ? (spyC.meta.price / base - 1) * 100 : null;
    const s = computeSnapshot(bars, spyC.meta.price);
    above200 = s.sma200 != null ? s.price > s.sma200 : null;
    above50 = s.sma50 != null ? s.price > s.sma50 : null;
  }
  const marketText =
    above200 === false
      ? "약세장 (S&P 500이 200일선 아래) — 매수 수량은 절반, 신규 매수는 신중하게."
      : above50 === false
        ? "단기 조정 (S&P 500이 50일선 아래, 200일선 위) — 나눠서 매수."
        : "상승 추세 (S&P 500이 50일선·200일선 위) — 규칙대로 매수 가능.";

  // 모의투자
  const paperFile = await loadPaper();
  let paper: WeeklyReport["paper"] = null;
  if (paperFile) {
    const sum = paperSummary(paperFile);
    const weekStartDay = new Date(weekStart).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
    const before = [...paperFile.history].reverse().find((h) => h.day < weekStartDay);
    const base = before?.equity ?? (paperFile.startedAt >= weekStart ? PAPER_START_CASH : null);
    const wk = paperFile.trades.filter((t) => t.at >= weekStart);
    paper = {
      equity: sum.equity,
      week: base ? (sum.equity / base - 1) * 100 : null,
      total: sum.ret,
      spyTotal: sum.spyRet,
      buys: wk.filter((t) => t.side === "buy").length,
      sells: wk.filter((t) => t.side === "sell").length,
      realized: wk.reduce((a, t) => a + (t.pnl ?? 0), 0),
    };
  }

  // 성적표
  const track = await loadTrack();
  const st = trackStats(track.records);
  const closedThisWeek = track.records
    .filter((r) => r.exit && r.exit.at >= weekStart)
    .map((r) => ({ name: r.nameKo ?? r.name, symbol: r.symbol, ret: (r.exit!.price / r.entry - 1) * 100, reason: r.exit!.reason }));
  const newPicks = track.records
    .filter((r) => r.pickedAt >= weekStart)
    .map((r) => ({ name: r.nameKo ?? r.name, symbol: r.symbol, grade: r.grade, total: r.total }));

  // 다음 주 실적 발표 (Top 10 + 모의투자 보유 중 Top 10에 있는 종목)
  const earnings = top
    .filter((p) => p.earningsDate && p.earningsDate * 1000 > now && p.earningsDate * 1000 < now + 9 * DAY)
    .map((p) => ({ name: p.nameKo ?? p.name, symbol: p.symbol, date: p.earningsDate! }))
    .sort((a, b) => a.date - b.date);

  const headline = paper
    ? `이번 주 모의투자 ${pc(paper.week)} · S&P 500 ${pc(spyWeek)} · 누적 ${pc(paper.total)}(지수 ${pc(paper.spyTotal)})`
    : `이번 주 S&P 500 ${pc(spyWeek)}`;

  return {
    id: new Date(firstBar).toLocaleDateString("sv-SE", { timeZone: "America/New_York" }),
    createdAt: now,
    range: `${md(firstBar)} ~ ${md(now - 6 * 3600_000)}`,
    headline,
    market: { spyWeek, above200, above50, text: marketText },
    paper,
    track: { open: st.open, openAvg: st.current.avg, openSpy: st.current.spyAvg, closedThisWeek },
    newPicks,
    top: top.map((p) => ({ name: p.nameKo ?? p.name, symbol: p.symbol, grade: p.gradeLetter ?? null, total: p.total })),
    earnings,
  };
}

/** 저장 (같은 주는 덮어쓰기, 최근 52주 보관) */
export async function saveWeekly(r: WeeklyReport) {
  const list = (await loadWeekly()).filter((x) => x.id !== r.id);
  list.unshift(r);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(list.slice(0, 52)));
}

/** 휴대폰 알림용 글 */
export function weeklyPush(r: WeeklyReport): { title: string; message: string } {
  const lines = [r.headline, `시장: ${r.market.text}`];
  if (r.track.closedThisWeek.length)
    lines.push(`추천 종료 ${r.track.closedThisWeek.length}건: ${r.track.closedThisWeek.map((c) => `${c.name} ${pc(c.ret)}`).join(", ")}`);
  if (r.newPicks.length) lines.push(`새 추천 ${r.newPicks.length}건: ${r.newPicks.map((p) => p.name).join(", ")}`);
  if (r.earnings.length)
    lines.push(`다음 주 실적 발표: ${r.earnings.map((e) => `${e.name} ${new Date(e.date * 1000).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}`).join(", ")} — 발표 전엔 새로 사지 않기`);
  return { title: `주간 리포트 (${r.range})`, message: lines.join("\n") };
}

/** 이번 마감이 이번 주 마지막 정규장인가 (다음 개장까지 40시간 넘게 남음 = 주말·연휴 앞) */
export function isWeekEnd(regularEnd: number | null, nextOpen: number | null): boolean {
  if (!regularEnd || !nextOpen) return false;
  return nextOpen - regularEnd > 40 * 3600_000;
}
