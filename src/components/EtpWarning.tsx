import { LEV_ETP_NOTES, VOL_ETP_NOTES } from "@/lib/strategy";

export default function EtpWarning({ kind, symbol }: { kind: "volatility" | "leveraged"; symbol: string }) {
  const notes = kind === "volatility" ? VOL_ETP_NOTES : LEV_ETP_NOTES;
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 p-4">
      <div className="font-semibold text-warn text-sm">
        {symbol}는 {kind === "volatility" ? "VIX 선물 기반 변동성" : "레버리지·인버스"} 상품입니다
      </div>
      <p className="text-sm text-muted mt-1">
        기업 펀더멘털 분석과 장기 보유 논리가 적용되지 않습니다. RSI 반등 전략보다 보유 기간·손절 기준이 더 중요합니다.
      </p>
      <ul className="mt-2 space-y-1 text-sm list-disc pl-5 text-text/85">
        {notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
