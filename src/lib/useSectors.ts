"use client";
import { useEffect, useState } from "react";

const cache = new Map<string, string | null>();

/** 종목별 업종 (한 번 받은 값은 기억) */
export function useSectors(symbols: string[]): Record<string, string | null> {
  const key = [...new Set(symbols)].sort().join(",");
  const [map, setMap] = useState<Record<string, string | null>>({});
  useEffect(() => {
    const syms = key ? key.split(",") : [];
    const missing = syms.filter((s) => !cache.has(s));
    const done = () => setMap(Object.fromEntries(syms.map((s) => [s, cache.get(s) ?? null])));
    if (!missing.length) {
      done();
      return;
    }
    let alive = true;
    fetch(`/api/sectors?symbols=${missing.join(",")}`)
      .then((r) => r.json())
      .then((j: { sectors: Record<string, string | null> }) => {
        for (const [s, v] of Object.entries(j.sectors ?? {})) cache.set(s, v);
        if (alive) done();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return map;
}

/** 업종별 개수 → 많은 순 */
export function sectorCounts(sectors: (string | null | undefined)[]): [string, number][] {
  const m = new Map<string, number>();
  for (const s of sectors) if (s) m.set(s, (m.get(s) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
