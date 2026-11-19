// 서버 전용: .data/ 의 결과 파일 읽기 (배포 서버는 GitHub data 브랜치에서, 2분 캐시)
import { readFile } from "node:fs/promises";
import path from "node:path";

const BASE = process.env.DATA_BASE_URL?.replace(/\/$/, "");
const C = globalThis as unknown as { __dataFiles?: Map<string, { at: number; data: unknown }> };
const cache = (C.__dataFiles ??= new Map());

export async function readDataFile<T>(name: string, ttlMs = 2 * 60_000): Promise<T | null> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T | null;
  try {
    let data: T;
    if (BASE) {
      const res = await fetch(`${BASE}/${name}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      data = (await res.json()) as T;
    } else {
      data = JSON.parse(await readFile(path.join(process.cwd(), ".data", name), "utf8")) as T;
    }
    cache.set(name, { at: Date.now(), data });
    return data;
  } catch {
    cache.set(name, { at: Date.now() - ttlMs + 60_000, data: hit?.data ?? null });
    return (hit?.data as T) ?? null;
  }
}
