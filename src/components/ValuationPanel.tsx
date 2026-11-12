"use client";
import { Chip, Section, TONE_CLASS } from "@/components/ui";
import { money, pct, toneOf } from "@/lib/format";
import type { HorizonGrade } from "@/lib/grades";
import type { Resilience } from "@/lib/resilience";
import { MODEL_NAME, type Sensitivity, type Valuation } from "@/lib/valuation";

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

const CONF_TONE = { high: "good", mid: "warn", low: "bad" } as const;
const usdBig = (v: number | null) =>
  v == null ? "–" : Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`;

/** 적정가 계산 근거 */
export function ValuationPanel({ v, price, sensitivity }: { v: Valuation | null; price: number; sensitivity?: Sensitivity | null }) {
  if (!v) return null;
  const up = (x: number | null) => (x != null && price > 0 ? ((x - price) / price) * 100 : null);
  return (
    <Section title={`적정가 계산 — ${MODEL_NAME}`} right={<Chip tone={v.fairValue != null ? CONF_TONE[v.confidence.level] : "neutral"}>{v.confidence.label}</Chip>}>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <div>
          <div className="text-xs text-muted">기준 적정가</div>
          <div className="text-3xl font-semibold num">{v.fairValue != null ? money(v.fairValue) : "계산 불가"}</div>
        </div>
        <div>
          <div className="text-xs text-muted">현재가 {money(price)} 대비</div>
          <div className={`text-xl font-semibold num ${toneOf(up(v.fairValue))}`}>{pct(up(v.fairValue), 1)}</div>
        </div>
      </div>

      {v.scenarios.length > 0 && (
        <div className="overflow-x-auto mt-4 -mx-4 sm:-mx-5">
          <table className="data min-w-[420px]">
            <thead>
              <tr>
                <th>구분</th>
                {v.scenarios.map((s) => <th key={s.key} className="text-right">{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-muted">적정 주당가치</td>
                {v.scenarios.map((s) => <td key={s.key} className={`text-right num ${s.key === "base" ? "font-semibold" : ""}`}>{money(s.fairValue)}</td>)}
              </tr>
              <tr>
                <td className="text-muted">현재가 대비</td>
                {v.scenarios.map((s) => <td key={s.key} className={`text-right num ${toneOf(up(s.fairValue))}`}>{pct(up(s.fairValue), 0)}</td>)}
              </tr>
              <tr>
                <td className="text-muted">적정 시가총액</td>
                {v.scenarios.map((s) => <td key={s.key} className="text-right num">{usdBig(s.marketCap)}</td>)}
              </tr>
              <tr>
                <td className="text-muted text-xs">가정: 시작 성장률 · 할인율 · 비교 배수</td>
                {v.scenarios.map((s) => (
                  <td key={s.key} className="text-right num text-xs text-muted">
                    {(s.growth * 100).toFixed(0)}% · {s.rate != null ? `${(s.rate * 100).toFixed(1)}%` : "–"} · ×{s.multipleAdj}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
        <div className="rounded-lg border border-line p-2">
          <div className="text-muted">순현금</div>
          <div className={`num font-medium mt-0.5 ${toneOf(v.netCash)}`}>{usdBig(v.netCash)}</div>
        </div>
        <div className="rounded-lg border border-line p-2">
          <div className="text-muted">발행주식</div>
          <div className="num font-medium mt-0.5">{v.shares.basic ? `${(v.shares.basic / 1e6).toFixed(1)}M` : "확인 불가"}</div>
        </div>
        <div className="rounded-lg border border-line p-2">
          <div className="text-muted">완전희석주식</div>
          <div className="num font-medium mt-0.5">{v.shares.used ? `${(v.shares.used / 1e6).toFixed(1)}M` : "확인 불가"}</div>
        </div>
        <div className="rounded-lg border border-line p-2">
          <div className="text-muted">1년간 주식 수 변화</div>
          <div className={`num font-medium mt-0.5 ${v.shares.changeYoY != null && v.shares.changeYoY > 0.04 ? "text-bad" : ""}`}>
            {v.shares.changeYoY != null ? `${v.shares.changeYoY > 0 ? "+" : ""}${(v.shares.changeYoY * 100).toFixed(1)}%` : "확인 불가"}
          </div>
        </div>
      </div>
      {v.fairValue != null && (
        <details className="mt-2">
          <summary className="text-xs text-accent cursor-pointer select-none">신뢰도 근거</summary>
          <ul className="mt-1 text-xs text-muted space-y-0.5">
            {v.confidence.reasons.map((r) => <li key={r}>• {r}</li>)}
          </ul>
        </details>
      )}
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
      {sensitivity && (
        <details className="mt-3">
          <summary className="text-xs text-accent cursor-pointer select-none">DCF 민감도 — 할인율·영구성장률이 바뀌면</summary>
          <div className="overflow-x-auto mt-2">
            <table className="data min-w-[320px]">
              <thead>
                <tr>
                  <th className="text-xs">할인율 \ 영구성장률</th>
                  {sensitivity.terms.map((t) => <th key={t} className="text-right">{(t * 100).toFixed(1)}%</th>)}
                </tr>
              </thead>
              <tbody>
                {sensitivity.rates.map((r, i) => (
                  <tr key={r}>
                    <td className="num">{(r * 100).toFixed(1)}%</td>
                    {sensitivity.grid[i].map((x, j) => (
                      <td key={j} className={`text-right num ${i === 1 && j === 1 ? "font-semibold" : ""}`}>{money(x)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted mt-1">DCF 항목만의 주당가치입니다(가운데가 기준). 표의 값 차이가 클수록 가정에 민감한 기업입니다.</p>
        </details>
      )}
      <ul className="text-xs text-muted mt-3 space-y-0.5">
        {v.notes.map((n) => <li key={n}>{n}</li>)}
        <li>애널리스트 목표가·투자의견은 사용하지 않습니다. 재무 수치는 야후 파이낸스 집계 기준이며, SEC 공시 원문과 다를 수 있습니다.</li>
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
