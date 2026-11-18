"use client";
// 장 상태·시장 국면을 여러 화면에서 함께 쓰는 훅 (요청은 한 번만, 5분마다 갱신)
import { useEffect, useState } from "react";

export interface Regime {
  spy: number;
  sma200: number;
  sma50: number | null;
  above200: boolean;
  above50: boolean | null;
  gap200: number; // 200일선 대비 %
}

export interface SessionInfo {
  state: "pre" | "regular" | "post" | "closed";
  regularEnd: number | null;
  nextOpenAt: number | null;
  nextOpenExact: boolean;
  regime: Regime | null;
  usdkrw: number | null; // 달러-원 환율
  serverTime: number;
}

let cache: { at: number; data: SessionInfo } | null = null;
let inflight: Promise<SessionInfo | null> | null = null;
const subs = new Set<(s: SessionInfo) => void>();

async function load(force = false): Promise<SessionInfo | null> {
  if (!force && cache && Date.now() - cache.at < 5 * 60_000) return cache.data;
  if (inflight) return inflight;
  inflight = fetch("/api/session", { cache: "no-store" })
    .then((r) => r.json() as Promise<SessionInfo>)
    .then((d) => {
      cache = { at: Date.now(), data: d };
      subs.forEach((f) => f(d));
      return d;
    })
    .catch(() => cache?.data ?? null)
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function refreshSession() {
  return load(true);
}

export function useSession(): SessionInfo | null {
  const [s, setS] = useState<SessionInfo | null>(cache?.data ?? null);
  useEffect(() => {
    subs.add(setS);
    void load();
    const t = setInterval(() => void load(), 5 * 60_000);
    return () => {
      subs.delete(setS);
      clearInterval(t);
    };
  }, []);
  return s;
}

/** 약세장(S&P 500이 200일선 아래)인가 */
export function useBearMarket(): boolean {
  const s = useSession();
  return s?.regime ? !s.regime.above200 : false;
}

/** 달러-원 환율 (모르면 null) */
export function useUsdKrw(): number | null {
  return useSession()?.usdkrw ?? null;
}
