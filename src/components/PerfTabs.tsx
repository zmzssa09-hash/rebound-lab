"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/track", label: "추천 성적표" },
  { href: "/paper", label: "모의투자" },
  { href: "/backtest", label: "과거 검증" },
  { href: "/weekly", label: "주간 리포트" },
];
export const PERF_PATHS = TABS.map((t) => t.href);

/** 성과 메뉴 안의 탭 */
export default function PerfTabs() {
  const path = usePathname();
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-line -mt-1 mb-1">
      {TABS.map((t) => {
        const on = path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${on ? "border-accent text-text font-medium" : "border-transparent text-muted hover:text-text"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
