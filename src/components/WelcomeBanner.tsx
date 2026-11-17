"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "rebound-lab:welcome-closed";

/** 처음 방문한 사람에게 3단계 안내를 권한다 (닫으면 다시 안 보임) */
export default function WelcomeBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let closed = false;
    try {
      closed = localStorage.getItem(KEY) === "1";
    } catch {
      /* 저장소를 못 쓰면 매번 표시 */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(!closed);
  }, []);
  if (!show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* 무시 */
    }
    setShow(false);
  };
  return (
    <div className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 flex flex-wrap items-center gap-3">
      <span className="text-lg" aria-hidden>👋</span>
      <div className="flex-1 min-w-56 text-sm">
        <b>처음 오셨나요?</b> 추천 보는 법 → 사는 법 → 파는 시점, 3단계만 읽으면 바로 쓸 수 있어요.
      </div>
      <Link href="/guide" className="btn border-accent/60 text-accent" onClick={close}>3단계 안내 보기</Link>
      <button className="text-xs text-muted hover:text-text" onClick={close} aria-label="안내 닫기">닫기</button>
    </div>
  );
}
