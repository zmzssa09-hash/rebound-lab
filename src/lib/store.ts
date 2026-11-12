"use client";
// 사용자 데이터는 서버로 보내지 않고 각자의 브라우저(localStorage)에만 저장한다.
import { useSyncExternalStore } from "react";
import type { AppData } from "./types";

const KEY = "rebound-lab:v1";

export const EMPTY: AppData = {
  version: 1,
  cash: 0,
  positions: [],
  watchlist: [],
  research: {},
  pretrade: {},
};

let current: AppData | null = null;
const listeners = new Set<() => void>();

function load(): AppData {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    current = raw ? normalize(JSON.parse(raw)) : EMPTY;
  } catch {
    current = EMPTY;
  }
  return current;
}

export function normalize(x: unknown): AppData {
  const d = (x ?? {}) as Partial<AppData>;
  return {
    version: 1,
    cash: Number(d.cash) || 0,
    positions: Array.isArray(d.positions) ? d.positions : [],
    watchlist: Array.isArray(d.watchlist) ? d.watchlist : [],
    research: d.research && typeof d.research === "object" ? d.research : {},
    pretrade: d.pretrade && typeof d.pretrade === "object" ? d.pretrade : {},
  };
}

export function setData(updater: (d: AppData) => AppData) {
  current = updater(load());
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* 저장 실패(사생활 보호 모드 등) 시 메모리에만 유지 */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

/** 하이드레이션 전에는 false — 빈 상태 깜빡임 방지용 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export const uid = () => Math.random().toString(36).slice(2, 10);
