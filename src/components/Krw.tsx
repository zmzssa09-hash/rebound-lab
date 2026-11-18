"use client";
import { krw } from "@/lib/format";
import { useUsdKrw } from "@/lib/useSession";

/** 달러 금액 옆에 붙이는 원화 환산 (실시간 환율) */
export default function Krw({ usd, className = "text-muted", paren = true }: { usd: number | null | undefined; className?: string; paren?: boolean }) {
  const rate = useUsdKrw();
  if (usd == null || rate == null) return null;
  const s = krw(usd * rate);
  return <span className={className} title={`환율 $1 = ${rate.toFixed(1)}원 기준`}>{paren ? ` (≈ ${s})` : `≈ ${s}`}</span>;
}
