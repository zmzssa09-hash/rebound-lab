"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SymbolSearch from "./SymbolSearch";

const LINKS = [
  { href: "/", label: "홈" },
  { href: "/picks", label: "추천 종목" },
  { href: "/market", label: "시장 흐름" },
  { href: "/screener", label: "스크리너" },
  { href: "/analyze", label: "종목 분석" },
  { href: "/watchlist", label: "관심 종목" },
  { href: "/positions", label: "포지션" },
  { href: "/strategy", label: "전략" },
];

export default function Nav() {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="border-b border-line bg-bg/90 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M3 6l5 8 4-5 4 7 5-10" stroke="#6ea8fe" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="font-semibold tracking-tight">리바운드 랩</span>
        </Link>
        <nav className="hidden lg:flex items-center gap-0.5 text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-2.5 py-1.5 rounded-md whitespace-nowrap ${isActive(l.href) ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto w-full max-w-60">
          <SymbolSearch compact />
        </div>
      </div>
      <nav className="lg:hidden flex overflow-x-auto gap-1 px-3 pb-2 text-sm">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap ${isActive(l.href) ? "bg-panel-2" : "text-muted"}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
