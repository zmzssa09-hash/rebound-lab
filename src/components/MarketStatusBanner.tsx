"use client";
import { useEffect, useState } from "react";

interface SessionInfo {
  state: "pre" | "regular" | "post" | "closed";
  nextOpenAt: number | null;
  nextOpenExact: boolean;
  serverTime: number;
}

const STATE_TEXT: Record<string, string> = {
  pre: "프리장 — 정규장 개장 전",
  post: "정규장 마감 — 시간외 거래 중",
  closed: "미국 장 마감",
};

function untilKo(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(m / 60);
  if (h >= 24) return `${Math.floor(h / 24)}일 ${h % 24}시간 후`;
  if (h > 0) return m % 60 ? `${h}시간 ${m % 60}분 후` : `${h}시간 후`;
  return `${m}분 후`;
}

function whenKo(t: number, now: number) {
  const fmtDay = (x: number) => new Date(x).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  const time = new Date(t).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  if (fmtDay(t) === fmtDay(now)) return `오늘 ${time}`;
  if (fmtDay(t) === fmtDay(now + 86_400_000)) return `내일 ${time}`;
  const day = new Date(t).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" });
  return `${day} ${time}`;
}

/** 미국 정규장이 닫혀 있을 때 모든 페이지 상단에 보이는 안내 */
export default function MarketStatusBanner() {
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/session")
        .then((r) => r.json())
        .then((d: SessionInfo) => alive && setInfo(d))
        .catch(() => {});
    load();
    const poll = setInterval(load, 5 * 60_000);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  // 개장 시각이 지나면 바로 다시 확인
  useEffect(() => {
    if (info?.nextOpenAt && now > info.nextOpenAt + 60_000) {
      fetch("/api/session").then((r) => r.json()).then(setInfo).catch(() => {});
    }
  }, [now, info?.nextOpenAt]);

  if (!info || info.state === "regular" || !now) return null;
  const open = info.nextOpenAt;
  return (
    <div className="border-b border-warn/30 bg-warn/10 text-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-warn">🌙 {STATE_TEXT[info.state]} · 가격은 직전 정규장 종가 기준</span>
        {open && (
          <span className="text-text">
            다음 개장 <span className="num font-medium">{whenKo(open, now)}</span>
            <span className="text-muted"> ({untilKo(open - now)}{info.nextOpenExact ? "" : ", 휴장일 제외"})</span>
          </span>
        )}
        <span className="text-muted text-xs">개장하면 가격은 1분마다, 전체 분석은 30분마다 자동 갱신</span>
      </div>
    </div>
  );
}
