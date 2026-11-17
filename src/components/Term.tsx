"use client";
import type { ReactNode } from "react";
import { GLOSSARY } from "@/lib/strategy";

const MAP = new Map(GLOSSARY.map((g) => [g.term, g.meaning]));

/** 용어 설명 말풍선: 마우스를 올리거나(PC) 누르면(모바일) 뜻이 보인다 */
export default function Term({ k, children }: { k: string; children?: ReactNode }) {
  const meaning = MAP.get(k);
  if (!meaning) return <>{children ?? k}</>;
  return (
    <span className="group relative inline-block" tabIndex={0}>
      <span className="underline decoration-dotted decoration-muted/70 underline-offset-[3px] cursor-help">{children ?? k}</span>
      <span
        role="tooltip"
        className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 transition-opacity absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-50 w-64 max-w-[80vw] rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs font-normal text-text leading-relaxed shadow-lg text-left whitespace-normal"
      >
        <b className="text-accent">{k}</b> — {meaning}
      </span>
    </span>
  );
}
