"use client";
import { useEffect } from "react";
import { Section, TONE_CLASS } from "@/components/ui";
import { money } from "@/lib/format";
import { discountOf, finalScore, RED_FLAGS, SCORE_ITEMS, type AutoScore } from "@/lib/scorecard";
import { setData, useAppData, useHydrated } from "@/lib/store";
import type { ResearchNote, Snapshot } from "@/lib/types";

const blank = (): ResearchNote => ({ notes: {}, thesis: "", updatedAt: new Date().toISOString() });

export default function Scorecard({ symbol, snap, auto }: { symbol: string; snap: Snapshot; auto: AutoScore | null }) {
  const app = useAppData();
  const hydrated = useHydrated();
  const note = (hydrated ? app.research[symbol] : undefined) ?? blank();
  const overrides = note.scores ?? {};

  const update = (fn: (n: ResearchNote) => ResearchNote) =>
    setData((d) => ({
      ...d,
      research: { ...d.research, [symbol]: { ...fn(d.research[symbol] ?? blank()), updatedAt: new Date().toISOString() } },
    }));

  const base: AutoScore = auto ?? { scores: {}, reasons: {}, fairValue: null, fairValueSource: null, flags: {}, suspects: {} };
  const r = finalScore(base, { scores: note.scores, fairValue: note.fairValue, redFlags: note.redFlags }, snap.price);
  const discount = discountOf(snap.price, r.fairValue);

  // 관심 종목 화면에 보여줄 마지막 결과 저장
  useEffect(() => {
    if (!hydrated || !auto) return;
    const cur = app.research[symbol];
    if (cur && cur.lastTotal === r.total && cur.lastGrade === r.grade.title && cur.lastScored === r.scored) return;
    setData((d) => ({
      ...d,
      research: {
        ...d.research,
        [symbol]: {
          ...(d.research[symbol] ?? blank()),
          lastTotal: r.total,
          lastGrade: r.grade.title,
          lastTone: r.grade.tone,
          lastScored: r.scored,
        },
      },
    }));
  }, [hydrated, auto, app.research, symbol, r.total, r.grade.title, r.grade.tone, r.scored]);

  const setScore = (key: string, v: number | null) =>
    update((n) => {
      const scores = { ...(n.scores ?? {}) };
      if (v == null) delete scores[key];
      else scores[key] = v;
      return { ...n, scores };
    });

  const setFlag = (key: string, v: boolean | undefined) =>
    update((n) => {
      const redFlags = { ...(n.redFlags ?? {}) };
      if (v === undefined) delete redFlags[key];
      else redFlags[key] = v;
      return { ...n, redFlags };
    });

  return (
    <Section title="종목 평가표 — 100점 만점" right={<span className="text-xs text-muted">자동 채점 · 직접 수정 가능</span>}>
      {!auto && <div className="h-2 rounded bg-panel-2 animate-pulse mb-4" />}

      {/* 종합 */}
      <div className={`rounded-xl border p-4 sm:p-5 flex flex-wrap items-center gap-5 ${TONE_CLASS[r.grade.tone]}`}>
        <div className="num">
          <span className="text-4xl font-semibold text-text">{r.total}</span>
          <span className="text-muted"> / 100</span>
        </div>
        <div className="flex-1 min-w-60">
          <div className="text-lg font-semibold">{r.grade.title}</div>
          <p className="text-sm text-text/85 mt-0.5 leading-relaxed">{r.grade.summary}</p>
        </div>
      </div>

      {/* 원칙 */}
      <div className="grid gap-3 md:grid-cols-2 mt-4">
        <div className="rounded-lg border border-line p-4">
          <div className="text-sm font-semibold">회피 신호 — 하락 원인 점검</div>
          <p className="text-xs text-muted mt-0.5">하나라도 해당하면 RSI가 아무리 낮아도 피합니다.</p>
          <div className="mt-3 space-y-2.5">
            {RED_FLAGS.map((f) => {
              const on = r.flagsOn[f.key];
              const autoReason = base.flags[f.key];
              const suspect = base.suspects[f.key];
              const overridden = note.redFlags?.[f.key] !== undefined;
              return (
                <div key={f.key} className="text-sm">
                  <label className="flex gap-2.5 items-start cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-[#fb7185]" checked={on} onChange={(e) => setFlag(f.key, e.target.checked)} />
                    <span>
                      <span className={on ? "text-bad font-medium" : ""}>{f.label}</span>
                      <span className="text-muted text-xs"> — {f.detail}</span>
                    </span>
                  </label>
                  <div className="pl-6 text-xs mt-0.5 space-y-0.5">
                    {autoReason && <div className="text-bad">데이터 확인: {autoReason}</div>}
                    {suspect && <div className="text-warn">뉴스 의심(확인 필요): “{suspect}”</div>}
                    {overridden && (
                      <button className="text-accent" onClick={() => setFlag(f.key, undefined)}>
                        직접 수정됨 · 자동 판정으로 되돌리기
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="rounded-lg border border-line p-4">
          <div className="text-sm font-semibold">단기 반등에 실패해도 장기 보유할 만한 기업인가?</div>
          <p className="text-xs text-muted mt-0.5">실적·성장성 13점 이상, 재무건전성 8점 이상이고 회피 신호가 없어야 통과합니다.</p>
          <div className="mt-3 text-lg font-semibold">
            {r.longTermOk === true && <span className="text-good">예 — 장기 보유 가능</span>}
            {r.longTermOk === false && <span className="text-bad">아니오 — 진입하지 않음</span>}
            {r.longTermOk === null && <span className="text-muted">판단 불가 — 실적·재무 점수가 필요합니다</span>}
          </div>
        </div>
      </div>

      {/* 항목별 */}
      <div className="space-y-3 mt-4">
        {SCORE_ITEMS.map((it) => {
          const score = r.scores[it.key];
          const manual = overrides[it.key] != null || (it.key === "discount" && note.fairValue != null);
          const fill = score != null ? (score / it.max) * 100 : 0;
          return (
            <div key={it.key} className="rounded-lg border border-line p-3 sm:p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-56">
                  <div className="font-medium">
                    {it.label} <span className="text-xs text-muted font-normal">{it.max}점</span>
                    <span className={`ml-1.5 text-[11px] ${manual ? "text-warn" : "text-accent"}`}>{manual ? "직접 수정" : "자동"}</span>
                  </div>
                  <div className="text-xs text-muted mt-0.5">{it.guide}</div>
                </div>
                <div className="num text-right shrink-0">
                  <span className="text-xl font-semibold">{score ?? "–"}</span>
                  <span className="text-muted text-sm"> / {it.max}</span>
                </div>
              </div>
              <div className="h-1.5 rounded bg-panel-2 mt-2.5 overflow-hidden">
                <div className={`h-full ${fill >= 70 ? "bg-good" : fill >= 45 ? "bg-warn" : "bg-bad"}`} style={{ width: `${fill}%` }} />
              </div>

              {(base.reasons[it.key] ?? []).length > 0 && (
                <ul className="mt-2.5 text-xs text-muted space-y-0.5 list-disc pl-4">
                  {base.reasons[it.key].map((x) => <li key={x}>{x}</li>)}
                </ul>
              )}

              {it.key === "discount" ? (
                <div className="flex flex-wrap items-center gap-2 mt-3 text-sm">
                  <span className="text-muted">적정가치 $</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28"
                    placeholder={base.fairValue ? base.fairValue.toFixed(2) : "직접 입력"}
                    value={note.fairValue ?? ""}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      update((n) => ({ ...n, fairValue: v > 0 ? v : undefined }));
                    }}
                  />
                  <span className="text-muted text-xs">
                    현재가 {money(snap.price)} →{" "}
                    {discount == null ? "적정가치 필요" : discount >= 0 ? `${discount.toFixed(1)}% 할인` : `${(-discount).toFixed(1)}% 고평가`}
                    {note.fairValue == null && base.fairValueSource && ` (${base.fairValueSource})`}
                  </span>
                </div>
              ) : it.key !== "technical" ? (
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  <input
                    type="range"
                    min={0}
                    max={it.max}
                    step={1}
                    className="flex-1 min-w-40 p-0 border-0 accent-[#6ea8fe]"
                    value={score ?? 0}
                    onChange={(e) => setScore(it.key, Number(e.target.value))}
                    aria-label={`${it.label} 점수`}
                  />
                  {overrides[it.key] != null && (
                    <button className="text-xs text-accent" onClick={() => setScore(it.key, null)}>
                      자동 점수로 되돌리기
                    </button>
                  )}
                </div>
              ) : null}

              <details className="mt-2">
                <summary className="text-xs text-accent cursor-pointer select-none">배점 기준</summary>
                <ul className="mt-1.5 text-xs space-y-1">
                  {it.bands.map((b) => (
                    <li key={b.range} className="flex gap-2">
                      <span className="num text-muted w-16 shrink-0">{b.range}</span>
                      <span>{b.text}</span>
                    </li>
                  ))}
                </ul>
              </details>
              <input
                className="w-full mt-2.5 text-sm"
                placeholder="내 메모 (예: 3분기 실적 확인 — 핵심 제품 검사량 성장률 12%로 둔화)"
                value={note.notes[it.key] ?? ""}
                onChange={(e) => update((n) => ({ ...n, notes: { ...n.notes, [it.key]: e.target.value } }))}
              />
            </div>
          );
        })}
      </div>

      <label className="block mt-4">
        <span className="text-sm font-medium">장기 보유 논리</span>
        <textarea
          className="w-full mt-1.5 text-sm min-h-20"
          placeholder="반등에 실패해도 이 회사를 보유할 이유. ‘언젠가 오르겠지’는 근거가 아닙니다."
          value={note.thesis}
          onChange={(e) => update((n) => ({ ...n, thesis: e.target.value }))}
        />
      </label>
      <p className="text-xs text-muted mt-3">
        자동 점수는 야후 파이낸스 재무 데이터와 뉴스 제목으로 계산한 출발점입니다. 최신 분기 실적·공시를 확인하고 필요하면 점수를 직접 고치세요.
      </p>
    </Section>
  );
}
