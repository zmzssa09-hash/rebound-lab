"use client";
import { Chip, Section, TONE_CLASS } from "@/components/ui";
import { money, pct, toneOf } from "@/lib/format";
import type { HorizonGrade } from "@/lib/grades";
import type { Resilience } from "@/lib/resilience";
import { MODEL_NAME, type Valuation } from "@/lib/valuation";

const dateKo = (t: number) => new Date(t * 1000).toLocaleDateString("ko-KR", { year: "2-digit", month: "short", day: "numeric" });

/** 단기·장기 등급 */
export function GradeBoxes({ grades, loading }: { grades: { short: HorizonGrade; long: HorizonGrade } | null; loading: boolean }) {
  if (loading || !grades) return <div className="grid gap-3 sm:grid-cols-2"><div className="card h-28 animate-pulse" /><div className="card h-28 animate-pulse" /></div>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[grades.short, grades.long].map((g) => (
        <div key={g.horizon} className={`rounded-xl border p-4 ${TONE_CLASS[g.tone]}`}>
          <div className="flex items-center gap-3">
            <span className="text-4xl font-bold text-text leading-none">{g.grade}</span>
            <div>
              <div className="text-xs opacity-80">{g.horizon === "short" ? "단기" : "장기"} 수익 등급 · {g.period}</div>
              <div className="font-semibold">{g.label}</div>
            </div>
            <span className="ml-auto num text-sm text-muted">{g.score}/100</span>
          </div>
          <p className="text-sm text-text/90 mt-2">{g.expected}</p>
          <details className="mt-1.5">
            <summary className="text-xs text-accent cursor-pointer select-none">등급 근거</summary>
            <ul className="mt-1 text-xs text-text/80 space-y-0.5">
              {g.parts.map((p) => <li key={p}>• {p}</li>)}
            </ul>
          </details>
        </div>
      ))}
    </div>
  );
}

/** 적정가 계산 근거 */
export function ValuationPanel({ v, price }: { v: Valuation | null; price: number }) {
  if (!v) return null;
  return (
    <Section title={`적정가 계산 — ${MODEL_NAME}`}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <div className="text-xs text-muted">적정가</div>
          <div className="text-3xl font-semibold num">{v.fairValue != null ? money(v.fairValue) : "계산 불가"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">현재가 {money(price)} 대비</div>
          <div className={`text-xl font-semibold num ${toneOf(v.upside)}`}>{pct(v.upside, 1)}</div>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {v.parts.map((p) => {
          const ok = p.value != null && p.value > 0;
          return (
            <details key={p.key} className="rounded-lg border border-line p-3" open={false}>
              <summary className="flex items-center gap-3 cursor-pointer select-none list-none">
                <span className="text-xs text-muted num w-9 shrink-0">{Math.round(p.weight * 100)}%</span>
                <span className="font-medium text-sm flex-1">{p.label}</span>
                <span className={`num font-semibold ${ok ? "" : "text-muted"}`}>{ok ? money(p.value) : "적용 불가"}</span>
                <span className="text-xs text-accent">근거</span>
              </summary>
              <ul className="mt-2 text-xs text-muted space-y-0.5 pl-12">
                {p.detail.map((d) => <li key={d}>• {d}</li>)}
              </ul>
            </details>
          );
        })}
      </div>
      <ul className="text-xs text-muted mt-3 space-y-0.5">
        {v.notes.map((n) => <li key={n}>{n}</li>)}
        <li>애널리스트 목표가·투자의견은 사용하지 않습니다.</li>
      </ul>
    </Section>
  );
}

/** 과거 회복탄력성 */
export function ResiliencePanel({ r }: { r: Resilience | null }) {
  if (!r) return null;
  const stat = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border border-line p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold num mt-0.5">{value}</div>
      {sub && <div className="text-[11px] text-muted mt-0.5">{sub}</div>}
    </div>
  );
  const sp = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  return (
    <Section title="과거 회복탄력성 — 이 종목이 과매도에서 얼마나 빨리 회복했나" right={<Chip tone={r.score >= 7 ? "good" : r.score >= 4 ? "warn" : "bad"}>{r.score}/10점</Chip>}>
      <p className="text-sm text-muted mb-3">최근 {r.years.toFixed(0)}년간 RSI가 30 이하로 떨어진 {r.n}번의 사례를 분석했습니다.</p>
      <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">
        {stat("60거래일 내 회복 비율", r.recovered60 != null ? `${(r.recovered60 * 100).toFixed(0)}%` : "–", "하락 직전 고점 회복 기준")}
        {stat("회복까지 걸린 기간", r.medianRecoveryDays != null ? `${r.medianRecoveryDays.toFixed(0)}거래일` : "–", r.medianRecoveryDays != null ? `약 ${(r.medianRecoveryDays / 5).toFixed(0)}주 (중앙값)` : "회복 사례 없음")}
        {stat("4주 뒤 수익", sp(r.medianRet20), r.winRate20 != null ? `상승 확률 ${(r.winRate20 * 100).toFixed(0)}%` : undefined)}
        {stat("12개월 뒤 수익", sp(r.medianRet250), r.winRate250 != null ? `상승 확률 ${(r.winRate250 * 100).toFixed(0)}%` : "사례 부족")}
      </div>
      {r.episodes.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-accent cursor-pointer select-none">과거 과매도 사례 {r.episodes.length}건 보기</summary>
          <div className="overflow-x-auto mt-2 -mx-4 sm:-mx-5">
            <table className="data min-w-[640px]">
              <thead>
                <tr>
                  <th>과매도 진입일</th>
                  <th className="text-right">RSI</th>
                  <th className="text-right">가격</th>
                  <th className="text-right">1주</th>
                  <th className="text-right">4주</th>
                  <th className="text-right">3개월</th>
                  <th className="text-right">12개월</th>
                  <th className="text-right">4주 내 추가 하락</th>
                  <th className="text-right">회복 기간</th>
                </tr>
              </thead>
              <tbody>
                {r.episodes.map((e) => (
                  <tr key={e.time}>
                    <td className="num">{dateKo(e.time)}</td>
                    <td className="text-right num">{e.rsi.toFixed(1)}</td>
                    <td className="text-right num">{money(e.entry)}</td>
                    {[e.ret5, e.ret20, e.ret60, e.ret250].map((v, i) => (
                      <td key={i} className={`text-right num ${toneOf(v)}`}>{sp(v)}</td>
                    ))}
                    <td className="text-right num text-down">{sp(e.maxDrawdown20)}</td>
                    <td className="text-right num">{e.recoveryDays != null ? `${e.recoveryDays}일` : <span className="text-bad">미회복</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
      <p className="text-xs text-muted mt-3">과거 성과가 미래 수익을 보장하지 않습니다. 같은 종목이라도 하락 이유가 다르면 회복 양상도 다를 수 있습니다.</p>
    </Section>
  );
}
