// 미국 장 시간에 맞춘 전 종목 재분석 규칙 (서버 전용)
//  - 정규장 중: 30분마다 재분석
//  - 정규장 마감 직후: 종가 기준 '마감 확정 분석' 1회
//  - 장 닫힌 시간·주말·휴장일: 재분석하지 않음 (실시간 가격 조회만 계속)
// 거래 시간은 야후의 SPY 거래시간 정보를 쓰므로 서머타임·휴장일·조기 폐장이 자동 반영된다.
import { fetchChart } from "./yahoo";

export const SCAN_EVERY_MS = 30 * 60 * 1000;
const EARLY_MS = 5 * 60 * 1000; // 예약이 몇 분 일찍 깨어나도 실행되도록 여유
const CLOSE_WINDOW_MS = 2 * 60 * 60 * 1000; // 마감 후 2시간 안에 확정 분석

export type SessionState = "pre" | "regular" | "post" | "closed";

export interface Session {
  state: SessionState;
  regularStart: number | null; // ms
  regularEnd: number | null; // ms
}

/** 지금 미국 장 상태 */
export async function getSession(now = Date.now()): Promise<Session> {
  try {
    const tp = (await fetchChart("SPY", "2y")).meta.tradingPeriod;
    if (!tp) throw new Error("no period");
    const s = { pre: tp.preStart * 1000, start: tp.regularStart * 1000, end: tp.regularEnd * 1000, post: tp.postEnd * 1000 };
    const state: SessionState =
      now >= s.start && now < s.end ? "regular" : now >= s.pre && now < s.start ? "pre" : now >= s.end && now < s.post ? "post" : "closed";
    return { state, regularStart: s.start, regularEnd: s.end };
  } catch {
    return { state: "closed", regularStart: null, regularEnd: null };
  }
}

export interface ScanDecision {
  run: boolean;
  reason: string;
  kind: "intraday" | "close" | "skip";
}

/** 지금 전 종목 재분석을 할지 */
export function decideScan(session: Session, lastScanAt: number, now = Date.now()): ScanDecision {
  if (session.state === "regular") {
    if (now - lastScanAt >= SCAN_EVERY_MS - EARLY_MS) return { run: true, reason: "정규장 30분 주기 분석", kind: "intraday" };
    return { run: false, reason: `정규장 중 — 마지막 분석 ${Math.round((now - lastScanAt) / 60000)}분 전이라 건너뜀`, kind: "skip" };
  }
  const end = session.regularEnd;
  if (end && now >= end && now - end < CLOSE_WINDOW_MS && lastScanAt < end + 60_000) {
    return { run: true, reason: "정규장 마감 — 종가 기준 확정 분석", kind: "close" };
  }
  if (!lastScanAt) return { run: true, reason: "분석 결과가 없어 첫 분석 실행", kind: "close" };
  return { run: false, reason: session.state === "pre" ? "프리장 — 정규장 개장 후 분석" : "장 닫힘 — 다음 정규장 개장 후 분석", kind: "skip" };
}

/** 화면 표시용: 다음 분석 예정 시각 (장이 닫혀 있으면 다음 개장 시각을 알 수 있을 때만) */
export function nextScanTime(session: Session, lastScanAt: number, now = Date.now()): number | null {
  if (session.state === "regular") return Math.max(lastScanAt + SCAN_EVERY_MS, now);
  if (session.state === "pre" && session.regularStart) return session.regularStart + 5 * 60 * 1000;
  const end = session.regularEnd;
  if (end && now >= end && now - end < CLOSE_WINDOW_MS && lastScanAt < end + 60_000) return now;
  return null;
}

/** 장중인데 갱신이 너무 오래 없으면 경고 */
export function isStale(session: Session, lastScanAt: number, now = Date.now()): boolean {
  return session.state === "regular" && now - lastScanAt > 75 * 60 * 1000;
}

/** 뉴욕 현지 시각(연·월·일·시·분)을 UTC ms로 변환 (서머타임 자동 반영) */
function nyWallToUtc(y: number, mo: number, d: number, h: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = nyParts(guess);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  return guess - (wall - guess);
}

function nyParts(t: number) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", weekday: "short", hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  for (const x of f.formatToParts(t)) o[x.type] = x.value;
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, wd: o.weekday };
}

/**
 * 다음 정규장 개장 시각.
 * 야후 시간표가 미래 개장을 알려주면 그대로 쓰고(휴장일 반영),
 * 아니면 다음 평일 오전 9:30(뉴욕)을 계산한다 — 이 경우 휴장일은 반영되지 않는다.
 */
export function nextRegularOpen(session: Session, now = Date.now()): { at: number; exact: boolean } {
  if (session.regularStart && session.regularStart > now) return { at: session.regularStart, exact: true };
  for (let i = 0; i < 8; i++) {
    const p = nyParts(now + i * 86_400_000);
    if (p.wd === "Sat" || p.wd === "Sun") continue;
    const at = nyWallToUtc(p.y, p.mo, p.d, 9, 30);
    if (at > now) return { at, exact: false };
  }
  return { at: now + 86_400_000, exact: false };
}
