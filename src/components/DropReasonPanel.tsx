"use client";
import { Chip, Section, TONE_CLASS } from "@/components/ui";
import type { DropAnalysis, TagKind } from "@/lib/dropReason";
import { bigMoneyKo } from "@/lib/ko";
import type { Fundamentals, Tone } from "@/lib/types";

export const KIND_TONE: Record<TagKind, Tone> = {
  fundamental: "bad",
  event: "warn",
  analyst: "warn",
  external: "neutral",
  positive: "good",
};

const KIND_LABEL: Record<TagKind, string> = {
  fundamental: "기업 실적·성장",
  event: "개별 이벤트",
  analyst: "애널리스트",
  external: "시장·업종",
  positive: "호재",
};

const dateKo = (t: number) =>
  new Date(t * 1000).toLocaleDateString("ko-KR", { month: "short", day: "numeric", timeZone: "America/New_York" });
const pctS = (v: number | null | undefined) => (v == null ? "–" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`);

export default function DropReasonPanel({
  drop,
  fundamentals: f,
  sectorKo,
  loading,
}: {
  drop: DropAnalysis | null;
  fundamentals: Fundamentals | null;
  sectorKo: string | null;
  loading: boolean;
}) {
  if (loading || !drop) {
    return (
      <Section title="왜 떨어졌나">
        <div className="space-y-2">
          <div className="h-4 rounded bg-panel-2 animate-pulse w-3/4" />
          <div className="h-4 rounded bg-panel-2 animate-pulse w-2/3" />
          <div className="h-4 rounded bg-panel-2 animate-pulse w-1/2" />
        </div>
      </Section>
    );
  }

  return (
    <Section
      title="왜 떨어졌나 — 하락 이유 분석"
      right={<span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[drop.natureTone]}`}>{drop.natureLabel}</span>}
    >
      <ul className="space-y-1.5 text-sm leading-relaxed">
        {drop.bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-muted">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>

      {drop.tagCounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-4">
          {drop.tagCounts.map((t) => (
            <Chip key={t.key} tone={KIND_TONE[t.kind]}>
              {t.label}
              {t.count > 1 && <span className="num opacity-70">×{t.count}</span>}
            </Chip>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5 mt-5">
        {/* 뉴스 */}
        <div className="lg:col-span-3">
          <div className="text-xs text-muted mb-2">최근 뉴스 (원문 영어 · 하락 원인 자동 분류)</div>
          {drop.recentNews.length === 0 ? (
            <p className="text-sm text-muted">최근 뉴스가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-line">
              {drop.recentNews.map((n) => (
                <li key={n.link || n.title} className="py-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    <span className="num">{dateKo(n.time)}</span>
                    <span>· {n.publisher}</span>
                    {n.tags.map((t) => (
                      <Chip key={t.key} tone={KIND_TONE[t.kind]}>{t.label}</Chip>
                    ))}
                  </div>
                  <a href={n.link} target="_blank" rel="noreferrer" className="text-sm hover:text-accent block mt-0.5">
                    {n.title}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 기업 개요 */}
        <div className="lg:col-span-2 space-y-3">
          <div className="text-xs text-muted">기업 개요</div>
          {f ? (
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm num">
              <dt className="text-muted">업종</dt>
              <dd className="text-right">{sectorKo ?? "–"}</dd>
              <dt className="text-muted">시가총액</dt>
              <dd className="text-right">{bigMoneyKo(f.marketCap)}</dd>
              <dt className="text-muted">매출 성장률</dt>
              <dd className={`text-right ${(f.revenueGrowth ?? 0) < 0 ? "text-bad" : ""}`}>{pctS(f.revenueGrowth)}</dd>
              <dt className="text-muted">영업이익률</dt>
              <dd className="text-right">{pctS(f.operatingMargin)}</dd>
              <dt className="text-muted">잉여현금흐름</dt>
              <dd className={`text-right ${(f.freeCashflow ?? 0) < 0 ? "text-bad" : ""}`}>{bigMoneyKo(f.freeCashflow != null && f.freeCashflow < 0 ? -f.freeCashflow : f.freeCashflow)}{f.freeCashflow != null && f.freeCashflow < 0 ? " 적자" : ""}</dd>
              <dt className="text-muted">현금 / 부채</dt>
              <dd className="text-right">{bigMoneyKo(f.cash)} / {bigMoneyKo(f.debt)}</dd>
              <dt className="text-muted">선행 PER</dt>
              <dd className="text-right">{f.forwardPE != null ? f.forwardPE.toFixed(1) : "–"}</dd>
              <dt className="text-muted">EV/EBITDA</dt>
              <dd className="text-right">{f.evToEbitda != null ? `${f.evToEbitda.toFixed(1)}배` : "–"}</dd>
              <dt className="text-muted">공매도 비율</dt>
              <dd className="text-right">{f.shortPercentFloat != null ? `${(f.shortPercentFloat * 100).toFixed(1)}%` : "–"}</dd>
              <dt className="text-muted">실적 발표일</dt>
              <dd className="text-right">{f.earningsDate ? new Date(f.earningsDate * 1000).toLocaleDateString("ko-KR") : "–"}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted">재무 데이터를 받지 못했습니다.</p>
          )}
          {f && f.quarterlyRevenue.length > 1 && (
            <div>
              <div className="text-xs text-muted mb-1">분기 매출 추이</div>
              <div className="flex items-end gap-1.5 h-20">
                {[...f.quarterlyRevenue].reverse().map((q, i, arr) => {
                  const vals = f.quarterlyRevenue.map((x) => x.revenue);
                  const max = Math.max(...vals);
                  const min = Math.min(...vals);
                  const h = 14 + ((q.revenue - min) / (max - min || 1)) * 34;
                  const down = i > 0 && q.revenue < arr[i - 1].revenue;
                  return (
                    <div key={q.date} className="flex-1 flex flex-col items-center gap-1" title={`${q.date}: ${bigMoneyKo(q.revenue)}`}>
                      <span className="text-[10px] num text-muted">{(q.revenue / 1e6).toFixed(0)}M</span>
                      <div className={`w-full rounded-sm ${down ? "bg-down/70" : "bg-up/60"}`} style={{ height: `${h}px` }} />
                      <span className="text-[10px] text-muted num">{q.date.slice(2, 7)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-muted mt-4 leading-relaxed">
        뉴스 분류는 제목의 키워드로 자동 판단하므로 틀릴 수 있습니다. 하락 원인이 매출 감소·현금흐름 악화·경쟁력 상실이라면 RSI가 아무리 낮아도
        피합니다. {KIND_LABEL.fundamental} 악재가 보이면 실적 자료로 반드시 확인하세요.
      </p>
    </Section>
  );
}
