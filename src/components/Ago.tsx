"use client";
import { useEffect, useState } from "react";

/** 상대 시각: 방금 전 / N분 전 / N시간 M분 전 / N일 전 */
export function relKo(t: number, now: number): string {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "방금 전";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 && h < 6 ? `${h}시간 ${m % 60}분 전` : `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 30초마다 갱신되는 현재 시각 */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** 상대 시각 표시. 마우스를 올리면 정확한 시각(한국 시간)이 보인다 */
export default function Ago({ t, className = "" }: { t: number | null | undefined; className?: string }) {
  const now = useNow();
  if (!t) return null;
  const abs = new Date(t).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <time dateTime={new Date(t).toISOString()} title={abs} className={className}>
      {now == null ? abs : relKo(t, now)}
    </time>
  );
}
