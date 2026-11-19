"use client";
// AI 종목 상담 — 모든 페이지 오른쪽 아래 버튼
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { money, pct, toneOf } from "@/lib/format";
import type { ChatCard } from "@/lib/chat/engine";

interface Msg {
  role: "user" | "assistant";
  content: string;
  cards?: ChatCard[];
  ai?: string | null;
  error?: boolean;
}

const EXAMPLES = ["지금 살 만한 종목 있어?", "엔비디아 지금 사도 돼?", "기술주 중에 적정가보다 싼 거", "걸러낸 종목은 왜 위험해?", "RSI가 뭐야?"];
const STORE = "rl-chat-v1";

const ACTION_TONE: Record<string, string> = {
  "적극 매수 검토": "text-good border-good/40",
  "분할 매수": "text-good border-good/40",
  관찰: "text-warn border-warn/40",
  "실적 발표 대기": "text-warn border-warn/40",
};

/** **굵게**와 줄바꿈만 처리 (HTML은 그대로 글자로 보임) */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const parts: ReactNode[] = line.split(/(\*\*[^*]+\*\*)/g).map((s, j) => (s.startsWith("**") && s.endsWith("**") ? <b key={j}>{s.slice(2, -2)}</b> : s));
        return (
          <p key={i} className={line.trim() ? "" : "h-2"}>
            {parts}
          </p>
        );
      })}
    </>
  );
}

function Card({ c, onGo }: { c: ChatCard; onGo: () => void }) {
  return (
    <Link href={`/analyze/${c.symbol}`} onClick={onGo} className="block rounded-lg border border-line bg-bg px-3 py-2 hover:border-accent/60 transition-colors">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-sm truncate">{c.name}</span>
        <span className="text-[11px] text-muted">{c.symbol}</span>
        {c.rank && <span className="text-[11px] text-accent">추천 {c.rank}위</span>}
        <span className="ml-auto text-xs num">
          {c.grade && <b>{c.grade}</b>} {c.total}점
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1 text-xs flex-wrap">
        <span className="num">{money(c.price)}</span>
        <span className={`num ${toneOf(c.changePct)}`}>{pct(c.changePct, 1)}</span>
        {c.rsi != null && <span className="text-muted num">RSI {Math.round(c.rsi)}</span>}
        {c.action && <span className={`rounded border px-1.5 py-px ${ACTION_TONE[c.action] ?? "text-bad border-bad/40"}`}>{c.action}</span>}
      </div>
      <div className="text-[11px] text-muted mt-1 num">
        {c.fairValue != null && (
          <>
            적정가 {money(c.fairValue)} (<span className={toneOf(c.upside)}>{pct(c.upside, 0)}</span>)
          </>
        )}
        {c.stop != null && <> · 손절 {money(c.stop)}</>}
        {c.t1 != null && <> · 1차 목표 {money(c.t1)}</>}
      </div>
      {c.excludeReason && <div className="text-[11px] text-bad mt-1 line-clamp-2">{c.excludeReason}</div>}
    </Link>
  );
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  // 닫힌 상태에서는 대화 내용을 그리지 않으므로 서버·브라우저 첫 화면이 같다
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      const saved = typeof window !== "undefined" ? sessionStorage.getItem(STORE) : null;
      return saved ? (JSON.parse(saved) as Msg[]) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    try {
      sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-20)));
    } catch {
      /* 무시 */
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, open]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: q }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) }),
      });
      const j = await res.json();
      if (!res.ok) setMsgs([...next, { role: "assistant", content: j.error ?? "답을 받지 못했습니다.", error: true }]);
      else {
        setMsgs([...next, { role: "assistant", content: j.answer, cards: j.cards, ai: j.ai }]);
        if (typeof j.left === "number") setLeft(j.left);
      }
    } catch {
      setMsgs([...next, { role: "assistant", content: "연결이 끊겼습니다. 잠시 뒤 다시 시도해 주세요.", error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (pathname?.startsWith("/api")) return null;

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 bottom-4 right-4 sm:bottom-6 sm:right-6 rounded-full bg-accent text-bg font-semibold shadow-lg px-4 py-3 text-sm hover:brightness-110"
          aria-label="AI 종목 상담 열기"
        >
          💬 AI에게 물어보기
        </button>
      )}
      {open && (
        <div className="fixed z-50 inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[400px] sm:h-[620px] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-panel border border-line sm:rounded-xl shadow-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
            <div className="font-semibold">AI 종목 상담</div>
            <span className="text-[11px] text-muted">사이트 분석 데이터로만 답합니다</span>
            <div className="ml-auto flex gap-1">
              {msgs.length > 0 && (
                <button className="text-xs text-muted hover:text-text px-2 py-1" onClick={() => setMsgs([])}>
                  새 대화
                </button>
              )}
              <button className="text-muted hover:text-text px-2 py-1" onClick={() => setOpen(false)} aria-label="닫기">
                ✕
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-muted leading-relaxed">
                  최근 많이 떨어진 미국 주식을 분석한 결과에서 찾아 드립니다. 종목 이름(한글·영문·티커)이나 조건으로 편하게 물어보세요.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((e) => (
                    <button key={e} className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent/60" onClick={() => send(e)}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-xl rounded-br-sm bg-accent/15 px-3 py-2 whitespace-pre-wrap">{m.content}</div>
                </div>
              ) : (
                <div key={i} className="space-y-2">
                  <div className={`max-w-[95%] rounded-xl rounded-bl-sm px-3 py-2 leading-relaxed space-y-1 ${m.error ? "bg-bad/10 text-bad" : "bg-panel-2"}`}>
                    <Rich text={m.content} />
                  </div>
                  {m.cards && m.cards.length > 0 && (
                    <div className="space-y-1.5">
                      {m.cards.map((c) => (
                        <Card key={c.symbol} c={c} onGo={() => setOpen(window.innerWidth >= 640)} />
                      ))}
                    </div>
                  )}
                  {!m.error && m.ai === null && <div className="text-[10px] text-muted">AI 연결이 안 돼 기본 검색으로 답했습니다</div>}
                </div>
              ),
            )}
            {busy && <div className="text-muted text-xs animate-pulse">데이터를 찾아보는 중…</div>}
            <div ref={endRef} />
          </div>

          <form
            className="border-t border-line p-3 space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={500}
                placeholder="예: 50달러 이하 매수 구간 종목"
                className="flex-1 text-sm"
                disabled={busy}
                autoFocus
              />
              <button className="btn btn-primary" disabled={busy || !input.trim()}>
                보내기
              </button>
            </div>
            <div className="text-[10px] text-muted leading-snug">
              AI 답은 틀릴 수 있습니다. 숫자는 카드에 나온 사이트 데이터가 기준이며, 투자 권유가 아닙니다.
              {left != null && <> · 오늘 남은 질문 {left}번</>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
