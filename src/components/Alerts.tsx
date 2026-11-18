"use client";
// 브라우저 알림: 사이트가 열려 있는 동안(다른 탭에 있어도) 1분마다 확인해서 알려준다.
//  - 보유 종목: 목표가 도달 / 손절가 도달
//  - 관심 종목: 직접 정한 관심 가격대 진입
//  - 추천 Top 10: 새 종목 진입
//  - 관심·보유 중인 추천 종목: 매수 구간 진입 / 1차 목표 도달 / 손절선 도달
// 설정과 알림 기록은 이 브라우저(localStorage)에만 저장한다.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import PhonePush from "@/components/PhonePush";
import { money } from "@/lib/format";
import { useAppData } from "@/lib/store";
import { zoneOf, ZONE_INFO } from "@/lib/tradePlan";
import type { Pick } from "@/lib/types";

const KEY = "rebound-lab:alerts";
const CHECK_MS = 60_000;

interface AlertItem {
  key: string;
  title: string;
  body: string;
  symbol: string;
  at: number;
}

interface AlertState {
  enabled: boolean;
  fired: Record<string, number>; // 같은 알림은 하루 한 번
  zones: Record<string, string>; // 직전 매수 구간 (진입 감지용)
  top: string[] | null; // 직전 Top 10
  recent: AlertItem[];
}

const EMPTY: AlertState = { enabled: false, fired: {}, zones: {}, top: null, recent: [] };

function loadState(): AlertState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as AlertState) } : EMPTY;
  } catch {
    return EMPTY;
  }
}
function saveState(s: AlertState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 저장 실패 시 무시 */
  }
}

const dayKey = () => new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
const supported = () => typeof window !== "undefined" && "Notification" in window;

export default function AlertBell() {
  const app = useAppData();
  const [st, setSt] = useState<AlertState>(EMPTY);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [open, setOpen] = useState(false);
  const appRef = useRef(app);
  useEffect(() => {
    appRef.current = app;
  }, [app]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSt(loadState());
    setPerm(supported() ? Notification.permission : "unsupported");
  }, []);

  const check = useCallback(async () => {
    const s = loadState();
    if (!s.enabled || !supported() || Notification.permission !== "granted") return;
    const a = appRef.current;
    const today = dayKey();
    const out: AlertItem[] = [];
    const fire = (key: string, symbol: string, title: string, body: string) => {
      const k = `${key}|${today}`;
      if (s.fired[k]) return;
      s.fired[k] = Date.now();
      out.push({ key: k, title, body, symbol, at: Date.now() });
    };

    let top: Pick[] = [];
    try {
      const j = await (await fetch("/api/picks", { cache: "no-store" })).json();
      top = (j.top ?? []) as Pick[];
    } catch {
      /* 다음 주기에 재시도 */
    }
    const held = new Set(a.positions.map((p) => p.symbol));
    const watched = new Set(a.watchlist.map((w) => w.symbol));

    // 추천 Top 10
    if (top.length) {
      const syms = top.map((p) => p.symbol);
      if (s.top) for (const p of top) if (!s.top.includes(p.symbol)) fire(`new-${p.symbol}`, p.symbol, `새 추천: ${p.nameKo ?? p.name}`, `${p.symbol} · ${p.gradeLetter ?? ""} ${p.total}점 — Top 10에 새로 들어왔습니다.`);
      s.top = syms;
      for (const p of top) {
        if (!held.has(p.symbol) && !watched.has(p.symbol)) continue;
        const price = p.live?.price ?? p.price;
        const name = p.nameKo ?? p.symbol;
        const z = zoneOf(p.plan?.zones ?? null, price);
        const prev = s.zones[p.symbol];
        if (z && (z === "aggressive" || z === "split") && prev && prev !== "aggressive" && prev !== "split")
          fire(`zone-${p.symbol}-${z}`, p.symbol, `${name}: ${ZONE_INFO[z].label} 진입`, `현재가 ${money(price)} — ${ZONE_INFO[z].action}`);
        if (z) s.zones[p.symbol] = z;
        if (p.plan?.t1 && price >= p.plan.t1.price) fire(`t1-${p.symbol}`, p.symbol, `${name}: 1차 목표 도달`, `현재가 ${money(price)} ≥ 1차 목표 ${money(p.plan.t1.price)} — 일부 이익 실현을 검토하세요.`);
        if (p.plan?.stop && price <= p.plan.stop.price) fire(`stop-${p.symbol}`, p.symbol, `${name}: 손절선 도달`, `현재가 ${money(price)} ≤ 손절 ${money(p.plan.stop.price)} — 계획대로 정리를 검토하세요.`);
      }
    }

    // 보유·관심 종목 시세
    const need = Array.from(new Set([...a.positions.map((p) => p.symbol), ...a.watchlist.map((w) => w.symbol)])).slice(0, 30);
    if (need.length) {
      try {
        const j = await (await fetch(`/api/quotes?symbols=${need.join(",")}`, { cache: "no-store" })).json();
        const prices = new Map<string, number>();
        for (const q of j.quotes ?? []) if (typeof q.price === "number") prices.set(q.symbol, q.price);
        for (const p of a.positions) {
          const price = prices.get(p.symbol);
          if (price == null) continue;
          if (p.target && price >= p.target) fire(`pos-target-${p.symbol}`, p.symbol, `${p.symbol}: 목표가 도달`, `현재가 ${money(price)} ≥ 목표 ${money(p.target)} (보유 ${p.shares}주)`);
          if (p.stop && price <= p.stop) fire(`pos-stop-${p.symbol}`, p.symbol, `${p.symbol}: 손절가 도달`, `현재가 ${money(price)} ≤ 손절 ${money(p.stop)} (보유 ${p.shares}주) — 계획대로 정리를 검토하세요.`);
        }
        for (const w of a.watchlist) {
          const price = prices.get(w.symbol);
          if (price == null) continue;
          for (const z of w.zones)
            if (price >= z.low && price <= z.high)
              fire(`watch-${w.symbol}-${z.id}`, w.symbol, `${w.symbol}: 관심 가격대 진입`, `현재가 ${money(price)} — ${z.label} (${money(z.low)}~${money(z.high)})${z.condition ? ` · 확인할 조건: ${z.condition}` : ""}`);
        }
      } catch {
        /* 다음 주기에 재시도 */
      }
    }

    // 오래된 기록 정리
    for (const k of Object.keys(s.fired)) if (Date.now() - s.fired[k] > 3 * 86_400_000) delete s.fired[k];
    if (out.length) {
      s.recent = [...out.reverse(), ...s.recent].slice(0, 20);
      for (const n of out) {
        try {
          const note = new Notification(n.title, { body: n.body, tag: n.key });
          note.onclick = () => {
            window.focus();
            window.location.href = `/analyze/${n.symbol}`;
          };
        } catch {
          /* 일부 모바일 브라우저는 페이지에서 직접 알림을 띄울 수 없음 */
        }
      }
    }
    saveState(s);
    setSt({ ...s });
  }, []);

  useEffect(() => {
    if (!st.enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void check();
    const t = setInterval(() => void check(), CHECK_MS);
    return () => clearInterval(t);
  }, [st.enabled, check]);

  const toggle = async () => {
    if (!supported()) return;
    let p = Notification.permission;
    if (!st.enabled && p === "default") p = await Notification.requestPermission();
    setPerm(p);
    const next = { ...loadState(), enabled: !st.enabled && p === "granted" };
    saveState(next);
    setSt(next);
    if (next.enabled) new Notification("리바운드 랩 알림을 켰습니다", { body: "매수 구간 진입·목표가·손절가·새 추천을 알려드립니다." });
  };

  const on = st.enabled && perm === "granted";
  return (
    <div className="relative">
      <button
        className={`h-9 w-9 grid place-items-center rounded-lg border ${on ? "border-accent/60 text-accent" : "border-line text-muted"} hover:text-text`}
        onClick={() => setOpen((v) => !v)}
        aria-label="알림 설정"
        title={on ? "알림 켜짐" : "알림 꺼짐"}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {st.recent.length > 0 && on && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-accent" />}
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 max-w-[90vw] card p-4 shadow-xl text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">알림</span>
            {perm === "unsupported" ? (
              <span className="text-xs text-muted">이 브라우저는 알림을 지원하지 않습니다</span>
            ) : (
              <button className={`btn text-xs ${on ? "border-accent/60 text-accent" : ""}`} onClick={toggle}>
                {on ? "켜짐 — 끄기" : "알림 켜기"}
              </button>
            )}
          </div>
          {perm === "denied" && <p className="text-xs text-bad mt-2">브라우저에서 이 사이트 알림이 차단되어 있습니다. 주소창 왼쪽 자물쇠 아이콘 → 알림 허용으로 바꿔 주세요.</p>}
          <ul className="text-xs text-muted mt-2 space-y-0.5">
            <li>• 보유 종목 목표가·손절가 도달 (포지션에 입력한 가격)</li>
            <li>• 관심 종목이 내가 정한 관심 가격대에 진입</li>
            <li>• 관심·보유 중인 추천 종목이 매수 구간 진입, 1차 목표·손절선 도달</li>
            <li>• 추천 Top 10에 새 종목 진입</li>
          </ul>
          <p className="text-[11px] text-muted mt-2">이 사이트가 브라우저에 열려 있을 때(다른 탭이어도) 1분마다 확인합니다. 같은 알림은 하루 한 번만 보냅니다.</p>
          <div className="mt-3 border-t border-line pt-3">
            <PhonePush compact />
          </div>
          {st.recent.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <div className="text-xs font-medium mb-1">최근 알림</div>
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {st.recent.map((n) => (
                  <li key={n.key + n.at}>
                    <Link href={`/analyze/${n.symbol}`} className="block hover:text-accent" onClick={() => setOpen(false)}>
                      <div className="text-xs font-medium">{n.title}</div>
                      <div className="text-[11px] text-muted">{n.body}</div>
                      <div className="text-[10px] text-muted num">{new Date(n.at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
