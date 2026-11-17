"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Term from "@/components/Term";
import { refreshSession, useSession } from "@/lib/useSession";

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

/** 모든 페이지 상단: 약세장 경고 + 장이 닫혀 있을 때 안내 */
export default function MarketStatusBanner() {
  const info = useSession();
  const [now, setNow] = useState(0);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(tick);
  }, []);

  // 개장 시각이 지나면 바로 다시 확인
  useEffect(() => {
    if (info?.nextOpenAt && now > info.nextOpenAt + 60_000) void refreshSession();
  }, [now, info?.nextOpenAt]);

  if (!info || !now) return null;
  const bear = info.regime && !info.regime.above200;
  const closed = info.state !== "regular";
  const open = info.nextOpenAt;
  // 직전 정규장이 끝난 지 하루가 넘었으면 주말·휴장
  const holiday = closed && info.regularEnd != null && now - info.regularEnd > 20 * 3600_000 && (!open || open - now > 3600_000);

  return (
    <>
      {bear && (
        <div className="border-b border-bad/40 bg-bad/10 text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-semibold text-bad">⚠ 약세장 — S&P 500이 <Term k="200일선" />보다 {Math.abs(info.regime!.gap200).toFixed(1)}% 아래</span>
            <span className="text-text">매수 수량은 평소의 절반으로, 새로 사는 건 신중하게.</span>
            <span className="text-muted text-xs">과매도 반등 전략이 가장 자주 실패하는 시기입니다. 몇 주 살지 계산기도 자동으로 절반으로 줄입니다.</span>
          </div>
        </div>
      )}
      {closed && (
        <div className="border-b border-warn/30 bg-warn/10 text-sm">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-warn">
              🌙 {holiday ? "주말·휴장일 — 미국 장 쉬는 날" : STATE_TEXT[info.state]} · 가격은 직전 정규장 종가 기준
            </span>
            {open && (
              <span className="text-text">
                다음 개장 <span className="num font-medium">{whenKo(open, now)}</span>
                <span className="text-muted"> ({untilKo(open - now)}{info.nextOpenExact ? "" : ", 휴장일 제외"})</span>
              </span>
            )}
            <span className="text-muted text-xs">
              {holiday ? "쉬는 동안은 분석도 쉽니다 — 마지막 분석은 직전 거래일 마감 기준이 최신입니다." : "개장하면 가격은 1분마다, 전체 분석은 30분마다 자동 갱신"}
            </span>
          </div>
        </div>
      )}
      {!bear && info.regime && info.regime.above50 === false && (
        <div className="border-b border-line bg-panel-2 text-xs">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-1.5 text-muted">
            S&P 500이 50일선 아래 — 단기 조정 중입니다. 200일선 위라 약세장은 아니지만 매수는 나눠서 하세요. <Link href="/guide" className="text-accent">초보자 안내 →</Link>
          </div>
        </div>
      )}
    </>
  );
}
