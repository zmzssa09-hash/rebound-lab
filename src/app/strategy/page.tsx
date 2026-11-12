"use client";
import DataTools from "@/components/DataTools";
import { PageHeader, Section } from "@/components/ui";
import { setData, useAppData, useHydrated } from "@/lib/store";
import { GRADE_SCALE, SCORE_ITEMS } from "@/lib/scorecard";
import {
  CORE_IDEA,
  FAIR_VALUE_MODEL,
  FINAL_PRINCIPLE,
  HORIZON_GRADES,
  GLOSSARY,
  LEV_ETP_NOTES,
  PRETRADE_CHECKLIST,
  PRINCIPLES,
  SELECTION_CHECKLIST,
  VOL_ETP_NOTES,
} from "@/lib/strategy";

export default function StrategyPage() {
  const app = useAppData();
  const hydrated = useHydrated();
  const done = PRETRADE_CHECKLIST.filter((c) => app.pretrade[c.key]).length;

  return (
    <div className="space-y-5">
      <PageHeader title="전략 노트" desc="과매도 반등 + 장기 펀더멘털 전략의 원칙과 체크리스트. 사이트의 자동 판정도 이 원칙을 따릅니다." />

      <div className="rounded-xl border border-accent/30 bg-accent/5 p-5">
        <div className="text-xs text-accent font-medium">핵심 아이디어</div>
        <p className="mt-1.5 leading-relaxed">{CORE_IDEA}</p>
        <p className="text-sm text-muted mt-2">기술적 과매도와 펀더멘털 저평가를 분리해서 판단하는 것이 핵심입니다.</p>
      </div>

      <div className="rounded-xl border border-good/40 bg-good/5 p-5">
        <div className="text-xs text-good font-medium">최우선 원칙</div>
        <p className="mt-1.5 text-lg font-semibold">{FINAL_PRINCIPLE}</p>
        <p className="text-sm text-muted mt-1.5 leading-relaxed">
          반대로 매출 감소, 현금흐름 악화, 경쟁력 상실이 하락 원인이라면 RSI가 아무리 낮아도 피합니다. 이중 투자전략 평가에서 회피 신호가 하나라도
          체크되거나 실적·재무 점수가 절반에 못 미치면 점수와 관계없이 ‘진입하지 않음’으로 판정됩니다.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="반드시 지킬 원칙">
          <ol className="space-y-2.5 text-sm leading-relaxed">
            {PRINCIPLES.map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-accent font-semibold num w-4 shrink-0">{i + 1}</span>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section
          title="거래 전 체크리스트"
          right={
            <div className="flex items-center gap-3 text-xs">
              <span className="text-muted num">{hydrated ? done : 0}/{PRETRADE_CHECKLIST.length}</span>
              <button className="text-accent" onClick={() => setData((d) => ({ ...d, pretrade: {} }))}>초기화</button>
            </div>
          }
        >
          <ul className="space-y-2">
            {PRETRADE_CHECKLIST.map((c) => (
              <li key={c.key}>
                <label className="flex gap-3 items-start text-sm cursor-pointer leading-relaxed">
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#6ea8fe]"
                    checked={hydrated && !!app.pretrade[c.key]}
                    onChange={(e) => setData((d) => ({ ...d, pretrade: { ...d.pretrade, [c.key]: e.target.checked } }))}
                  />
                  <span className={hydrated && app.pretrade[c.key] ? "text-muted line-through" : ""}>{c.text}</span>
                </label>
              </li>
            ))}
          </ul>
          {hydrated && done === PRETRADE_CHECKLIST.length && (
            <p className="text-sm text-good mt-3">모든 항목을 확인했습니다. 다음 거래 전에 초기화하세요.</p>
          )}
        </Section>
      </div>

      <Section title="이중 투자전략 평가 — 100점 만점">
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="data min-w-[640px]">
            <thead>
              <tr>
                <th>평가 항목</th>
                <th className="text-right">배점</th>
                <th>무엇을 보는가</th>
              </tr>
            </thead>
            <tbody>
              {SCORE_ITEMS.map((it) => (
                <tr key={it.key}>
                  <td className="font-medium whitespace-nowrap">{it.label}</td>
                  <td className="text-right num font-semibold">{it.max}점</td>
                  <td className="text-muted">{it.guide}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-11 gap-1.5 mt-4 text-xs text-center">
          {GRADE_SCALE.map(([g, r]) => (
            <div key={g} className={`rounded-lg border py-1.5 ${g.startsWith("S") || g.startsWith("A") ? "border-good/40 bg-good/5" : g.startsWith("B") || g.startsWith("C") ? "border-warn/40 bg-warn/5" : "border-bad/40 bg-bad/5"}`}>
              <b className="text-sm">{g}</b>
              <br />
              <span className="text-muted num">{r}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted mt-2">
          80점 이상 우수 · 65점 이상 양호 · 50점 이상 보류 · 50점 미만 제외. 추천 Top 10은 60점(C) 이상이고 장기 보유 기준을 통과한 종목에서 고르며, 한 번 들어온 종목은 50점 아래로 떨어지기 전까지 유지합니다.
          회피 신호(매출 감소·현금흐름 악화·경쟁력 상실)가 있거나 장기 보유 기준에 못 미치면 점수와 상관없이 F입니다.
        </p>
        <p className="text-xs text-muted mt-3">
          모든 항목은 재무·시세·뉴스 데이터로 자동 채점되고, 종목 분석 화면에서 직접 수정할 수 있습니다. 자동 점수는 출발점일 뿐이며 실제
          점수는 최신 실적과 공시를 확인한 후 산정합니다. 매출 감소·현금흐름 적자가 데이터로 확인되면 회피 신호가 자동으로 켜집니다.
          애널리스트 목표가·투자의견은 어떤 항목에도 사용하지 않습니다.
        </p>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="이중 투자전략 적정가 모델 1.1">
          <ul className="space-y-3 text-sm">
            {FAIR_VALUE_MODEL.map((m) => (
              <li key={m.label} className="flex gap-3">
                <span className="num font-semibold text-accent w-10 shrink-0">{m.weight ? `${m.weight}%` : "상한"}</span>
                <span>
                  <span className="font-medium">{m.label}</span>
                  <span className="block text-xs text-muted mt-0.5 leading-relaxed">{m.how}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-3">모든 주당가치는 완전희석주식수(스톡옵션·전환사채 포함)로 나눕니다. 같은 계산을 보수적(성장률 절반·할인율 +1%p·배수 ×0.8)·기준·낙관적(성장률 ×1.3·할인율 −1%p·배수 ×1.2) 가정으로 세 번 돌려 시나리오별 적정가를 냅니다. 계산할 수 없는 항목은 빼고 나머지 비중으로 다시 나누며, 자료가 부족하거나 방법별 결과 차이가 크면 신뢰도를 낮게 표시합니다.</p>
        </Section>
        <Section title="단기·장기 수익 등급">
          <ul className="space-y-3 text-sm">
            {HORIZON_GRADES.map((h) => (
              <li key={h.name}>
                <span className="font-medium">{h.name}</span>
                <span className="block text-xs text-muted mt-0.5 leading-relaxed">{h.how}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-3">두 점수 모두 100점 만점이며 위와 같은 S+~F 등급을 씁니다. 단기 목표가(1~4주 안에 팔 가격)와 장기 적정가(가치평가 결과)는 다른 개념입니다.</p>
          <div className="mt-4 text-sm font-medium">매수 구간 — 안전마진 적용</div>
          <ul className="mt-1.5 text-xs text-muted space-y-1 leading-relaxed">
            <li>매수가 = 기준 적정가 × (1 − 안전마진). 안전마진은 기본 20%에 적정가 신뢰도·변동성·소형주·현금흐름 적자에 따라 15~40%로 조정합니다.</li>
            <li><b className="text-good">적극 매수 검토</b> 매수가 이하 · <b className="text-good">분할 매수</b> 매수가 ~ 안전마진 절반 · <b className="text-warn">관찰</b> ~ 적정가 · <b className="text-bad">고평가</b> 적정가 초과</li>
            <li>손절선은 가장 가까운 지지선(3개월 저점·매물대 등) 아래로 정하고(현재가 대비 −5~−20%), 손익비가 1 미만이면 매수 구간이어도 관찰로 낮춥니다.</li>
          </ul>
        </Section>
      </div>

      <Section title="종목 선별 체크리스트">
        <div className="overflow-x-auto -mx-4 sm:-mx-5">
          <table className="data min-w-[640px]">
            <thead>
              <tr>
                <th>구분</th>
                <th>확인할 내용</th>
                <th>탈락·보류 신호</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-medium">기술적 <span className="text-xs text-accent">자동</span></td>
                <td>RSI(14), MACD, 이동평균선, 거래량, 지지·저항</td>
                <td className="text-muted">RSI만 낮고 하락 추세·거래량 매도가 계속됨</td>
              </tr>
              {SELECTION_CHECKLIST.map((c) => (
                <tr key={c.key}>
                  <td className="font-medium">{c.area}</td>
                  <td>{c.check}</td>
                  <td className="text-muted">{c.redFlag}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted mt-3">기술적 항목은 종목 분석 화면에서 자동 판정되고, 나머지는 종목별로 직접 평가해 저장할 수 있습니다.</p>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="변동성 ETP (SVIX·UVXY 등) 이해하기">
          <ul className="space-y-2 text-sm list-disc pl-5 leading-relaxed">
            {VOL_ETP_NOTES.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Section>
        <Section title="레버리지·인버스 ETP 이해하기">
          <ul className="space-y-2 text-sm list-disc pl-5 leading-relaxed">
            {LEV_ETP_NOTES.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Section>
      </div>

      <Section title="용어 정리">
        <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2 text-sm">
          {GLOSSARY.map((g) => (
            <div key={g.term} className="flex gap-3">
              <dt className="font-semibold w-20 shrink-0">{g.term}</dt>
              <dd className="text-muted leading-relaxed">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="내 데이터">
        <p className="text-sm text-muted mb-3">
          포지션·관심 종목·메모는 서버가 아닌 이 브라우저에만 저장됩니다. 다른 기기로 옮기거나 브라우저 데이터를 지우기 전에 백업하세요.
        </p>
        <DataTools />
      </Section>
    </div>
  );
}
