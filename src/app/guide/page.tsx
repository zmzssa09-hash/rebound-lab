"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { SizingSettings } from "@/components/PositionSizer";
import Term from "@/components/Term";
import { PageHeader, Section } from "@/components/ui";
import { GLOSSARY } from "@/lib/strategy";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent font-bold num">{n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-4 space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Box({ tone = "line", children }: { tone?: "good" | "warn" | "bad" | "line"; children: ReactNode }) {
  const cls = { good: "border-good/40 bg-good/5", warn: "border-warn/40 bg-warn/5", bad: "border-bad/40 bg-bad/5", line: "border-line bg-panel-2" }[tone];
  return <div className={`rounded-lg border px-4 py-3 ${cls}`}>{children}</div>;
}

export default function GuidePage() {
  return (
    <div className="space-y-5 max-w-3xl">
      <PageHeader
        title="처음 오셨나요? — 3단계 사용법"
        desc="주식을 잘 몰라도 이 순서대로만 하면 됩니다. 핵심은 세 가지예요: 정해진 가격에서만 사고, 사기 전에 손절가를 정하고, 한 종목에 너무 많이 넣지 않기."
      />

      <Box tone="warn">
        <b>먼저 알아둘 것</b> — 이 사이트는 &quot;많이 떨어졌지만 회사는 튼튼한&quot; 미국 주식을 골라 줍니다. 떨어진 주식은 더 떨어질 수도 있습니다. 그래서
        모든 추천에 <Term k="손절">손절가</Term>가 같이 나오고, 그 가격을 지키는 것이 이 전략의 전부입니다. 투자 권유가 아니며 최종 판단은 본인이 합니다.
      </Box>

      <Step n={1} title="추천 보는 법">
        <p>
          <Link href="/picks" className="text-accent">추천 종목</Link> 화면의 카드 하나하나가 추천입니다. 카드에서 이 순서로 보세요.
        </p>
        <ol className="space-y-2 list-decimal pl-5">
          <li>
            <b>지금 해야 할 일</b> — 가장 위 상자. 이것만 봐도 됩니다.
            <div className="flex flex-wrap gap-1.5 mt-1.5 text-xs">
              <span className="rounded-full border border-good/40 bg-good/10 text-good px-2 py-0.5">적극 매수 검토 · 분할 매수</span>
              <span className="text-muted">살 수 있는 가격</span>
              <span className="rounded-full border border-warn/40 bg-warn/10 text-warn px-2 py-0.5">관찰 · 실적 발표 대기</span>
              <span className="text-muted">기다림</span>
              <span className="rounded-full border border-bad/40 bg-bad/10 text-bad px-2 py-0.5">매수 보류 · 사지 않음</span>
              <span className="text-muted">사지 않음</span>
            </div>
          </li>
          <li>
            <b>점수와 등급</b> — 100점 만점, S+부터 F까지. 60점(C) 이상만 추천에 오릅니다. 단기(1~4주)·장기(3~12개월) 등급이 따로 있어서, 둘 다 높을수록 좋습니다.
          </li>
          <li>
            <b>왜 떨어졌나</b> — 하락 이유를 꼭 읽으세요. 시장 전체가 떨어져서 같이 빠진 것이면 회복이 빠른 편이고, 매출 감소·현금 고갈이 이유라면 사이트가 알아서 걸러냅니다.
          </li>
          <li>
            <b>과거 회복력</b> — 이 종목이 예전에 비슷하게 떨어졌을 때 얼마나 빨리 회복했는지 보여줍니다.
          </li>
        </ol>
        <Box>
          이 추천이 실제로 돈을 벌었는지는 <Link href="/track" className="text-accent">추천 성적표</Link>에서 누구나 확인할 수 있습니다. 좋은 결과만 골라 보여주지 않습니다.
        </Box>
      </Step>

      <Step n={2} title="사는 법">
        <ol className="space-y-2 list-decimal pl-5">
          <li>
            <b><Term k="매수 구간" />에 있을 때만 삽니다.</b> &quot;적극 매수 검토&quot;나 &quot;분할 매수&quot;일 때만요. 관찰·고평가면 기다립니다. 사이트가 <Term k="적정가" />에{" "}
            <Term k="안전마진" />을 적용해 미리 계산해 둡니다.
          </li>
          <li>
            <b>사기 전에 손절가를 확인합니다.</b> 카드에 적힌 손절가를 증권사 앱에 &quot;자동 매도(스탑로스)&quot;로 걸어 두면 가장 좋습니다.
          </li>
          <li id="sizing">
            <b>몇 주 살지는 계산기에 맡깁니다.</b> 투자금을 한 번만 입력하면 모든 카드에 살 수량이 나옵니다. 손절가에 걸려도 전체 투자금의 1%(또는 2%)만 잃도록, 한 종목은 투자금의
            20%를 넘지 않게 계산합니다.
            <div className="mt-2 rounded-lg border border-line p-3">
              <SizingSettings compact />
            </div>
          </li>
          <li>
            <b>한 번에 다 사지 않습니다.</b> 계산된 수량의 절반을 먼저 사고(<Term k="분할 매수" />), 지지선을 지키거나 반등이 시작되면 나머지를 삽니다.
          </li>
          <li>
            <b>이럴 땐 사지 않습니다.</b>
            <ul className="mt-1 space-y-1 list-disc pl-5 text-text/90">
              <li><Term k="실적 발표" /> 3일 전 — 카드에 &quot;실적 발표 대기&quot;가 뜹니다. 발표 뒤에 다시 보세요.</li>
              <li>화면 맨 위에 빨간 &quot;약세장&quot; 띠가 있을 때 — 사더라도 평소 수량의 절반만(계산기가 자동으로 줄여줍니다).</li>
              <li><Term k="손익비" />가 1.5보다 낮을 때 — 벌 수 있는 폭보다 잃을 수 있는 폭이 큽니다.</li>
            </ul>
          </li>
        </ol>
      </Step>

      <Step n={3} title="파는 시점">
        <ol className="space-y-2 list-decimal pl-5">
          <li>
            <b>손절가에 닿으면 팝니다. 예외 없이.</b> &quot;조금만 더 기다려 볼까&quot;가 가장 큰 손실을 만듭니다. 손절은 실패가 아니라 계획의 일부입니다.
          </li>
          <li>
            <b>1차 목표가에 닿으면 절반을 팝니다.</b> 이익을 일부 확정하고, 남은 절반의 손절가를 산 가격으로 올려 두면 그 뒤로는 손해 볼 일이 없습니다.
          </li>
          <li>
            <b>2차 목표가 또는 적정가 근처에서 나머지를 팝니다.</b> 장기로 가져갈 생각이면 장기 등급이 B 이상인 종목만 남기세요.
          </li>
          <li>
            <b>Top 10에서 빠지면 다시 확인합니다.</b> 빠진 이유가 &quot;반등 목표 달성&quot;이면 이익 실현을, &quot;회피 신호&quot;나 &quot;점수 하락&quot;이면 정리를 검토하세요.
          </li>
        </ol>
        <Box tone="good">
          화면을 계속 볼 수 없다면 오른쪽 위 <b>🔔 종 모양 버튼</b>으로 알림을 켜세요. 관심·보유 종목이 매수 구간에 들어오거나 목표가·손절가에 닿으면 알려드립니다. (사이트가 브라우저에 열려
          있어야 합니다. 다른 탭이어도 괜찮습니다.)
        </Box>
      </Step>

      <Section title="용어 풀이">
        <p className="text-xs text-muted mb-3">사이트 곳곳의 점선 밑줄 단어에 마우스를 올리거나 누르면 같은 설명이 나옵니다.</p>
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2 text-sm">
          {GLOSSARY.filter((g) => !["콘탱고", "백워데이션", "SBC"].includes(g.term)).map((g) => (
            <div key={g.term}>
              <dt className="font-medium text-accent">{g.term}</dt>
              <dd className="text-muted text-xs leading-relaxed mt-0.5">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
