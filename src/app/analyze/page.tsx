"use client";
import Link from "next/link";
import SymbolSearch from "@/components/SymbolSearch";
import { PageHeader } from "@/components/ui";
import { useAppData } from "@/lib/store";

const EXAMPLES = ["VCYT", "FFIV", "PYPL", "SVIX", "AAPL", "NVDA"];

export default function AnalyzeIndex() {
  const app = useAppData();
  const mine = Array.from(new Set([...app.positions.map((p) => p.symbol), ...app.watchlist.map((w) => w.symbol)]));
  return (
    <div>
      <PageHeader
        title="종목 분석"
        desc="RSI(14)·MACD·이동평균·거래량·지지선을 함께 판정하고, 100점 만점 이중 투자전략 평가로 ‘단기 반등에 실패해도 장기 보유할 만한 기업인가’를 점검합니다."
      />
      <div className="card p-5 sm:p-6">
        <SymbolSearch />
        <p className="text-xs text-muted mt-2">미국 상장 종목(NASDAQ·NYSE·NYSE American·Arca)만 지원합니다. 클래스 주식은 BRK-B처럼 하이픈을 씁니다.</p>
        {mine.length > 0 && (
          <div className="mt-5">
            <div className="text-xs text-muted mb-2">내 종목</div>
            <div className="flex flex-wrap gap-2">
              {mine.map((s) => (
                <Link key={s} href={`/analyze/${s}`} className="btn">{s}</Link>
              ))}
            </div>
          </div>
        )}
        <div className="mt-5">
          <div className="text-xs text-muted mb-2">예시</div>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((s) => (
              <Link key={s} href={`/analyze/${s}`} className="btn">{s}</Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
