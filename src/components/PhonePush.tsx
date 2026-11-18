"use client";
import { useState } from "react";
import { NTFY_TOPIC, NTFY_WEB } from "@/lib/notify";

/** 휴대폰 푸시(ntfy) 구독 방법 */
export default function PhonePush({ compact = false }: { compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(NTFY_TOPIC);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 복사 실패 시 직접 선택 */
    }
  };
  return (
    <div className={compact ? "text-xs" : "text-sm"}>
      <div className="font-medium">📱 사이트를 닫아도 휴대폰으로 받기 (무료·가입 없음)</div>
      <ol className="mt-1.5 space-y-1 list-decimal pl-5 text-muted">
        <li>
          휴대폰에 <b className="text-text">ntfy</b> 앱 설치 (
          <a className="text-accent" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noreferrer">안드로이드</a> ·{" "}
          <a className="text-accent" href="https://apps.apple.com/app/ntfy/id1625396347" target="_blank" rel="noreferrer">아이폰</a>)
        </li>
        <li>
          앱에서 <b className="text-text">+ (구독 추가)</b> → 주제 이름에 아래 글자를 붙여넣기
          <div className="flex items-center gap-2 mt-1">
            <code className="rounded bg-panel-2 border border-line px-2 py-0.5 text-text select-all">{NTFY_TOPIC}</code>
            <button className="text-accent" onClick={copy}>{copied ? "복사됨 ✓" : "복사"}</button>
          </div>
        </li>
        <li>끝. 자동 분석(장중 30분마다)이 끝날 때 새 추천·매수 구간 진입·목표가·손절선·추천 종료·모의투자 매매 소식이 옵니다.</li>
      </ol>
      <p className="text-[11px] text-muted mt-1.5">
        앱 없이 보려면 <a className="text-accent" href={NTFY_WEB} target="_blank" rel="noreferrer">웹에서 열기</a>. 모든 구독자가 같은 공개 추천 소식을 받습니다 — 내 관심 종목·포지션 알림은 위의
        브라우저 알림을 쓰세요.
      </p>
    </div>
  );
}
