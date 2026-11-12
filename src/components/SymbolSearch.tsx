"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { exchangeKo, typeKo } from "@/lib/ko";

interface Hit {
  symbol: string;
  name: string;
  nameKo: string | null;
  exchange: string;
  type: string;
}

/** 티커/회사명 검색. onPick이 없으면 분석 페이지로 이동 */
export default function SymbolSearch({
  compact,
  onPick,
  placeholder,
}: {
  compact?: boolean;
  onPick?: (symbol: string) => void;
  placeholder?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (!term) return;
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`)
        .then((r) => r.json())
        .then((j) => {
          setHits(j.results ?? []);
          setIdx(0);
        })
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (symbol: string) => {
    const s = symbol.trim().toUpperCase();
    // 검색 결과 없이 한글만 입력한 경우는 티커가 아니므로 이동하지 않음
    if (!s || /[ㄱ-ㅎㅏ-ㅣ가-힣\s]/.test(s)) return;
    setQ("");
    setHits([]);
    setOpen(false);
    if (onPick) onPick(s);
    else router.push(`/analyze/${encodeURIComponent(s)}`);
  };

  const visible = open && q.trim() ? hits : [];

  return (
    <div ref={box} className="relative w-full">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIdx((i) => Math.min(i + 1, visible.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIdx((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(visible[idx]?.symbol ?? q);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder ?? (compact ? "종목 검색 (엔비디아, NVDA)" : "티커 또는 회사명 — 한글도 됩니다 (예: 엔비디아, 스페이스X, VCYT)")}
        className={`w-full ${compact ? "text-sm py-1.5" : "py-2.5 text-base"}`}
        aria-label="종목 검색"
      />
      {visible.length > 0 && (
        <ul className="absolute z-40 mt-1 w-full min-w-72 right-0 card overflow-hidden shadow-xl">
          {visible.map((h, i) => (
            <li key={h.symbol}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(h.symbol)}
                onMouseEnter={() => setIdx(i)}
                className={`w-full text-left px-3 py-2 flex items-baseline gap-2 ${i === idx ? "bg-panel-2" : ""}`}
              >
                <span className="font-semibold text-sm shrink-0">{h.symbol}</span>
                <span className="text-xs truncate flex-1">
                  {h.nameKo ?? h.name}
                  {h.nameKo && h.nameKo !== h.name && <span className="text-muted"> · {h.name}</span>}
                </span>
                <span className="text-[11px] text-muted shrink-0">
                  {[exchangeKo(h.exchange), h.type && typeKo(h.type)].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
