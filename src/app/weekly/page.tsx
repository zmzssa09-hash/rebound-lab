"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import PerfTabs from "@/components/PerfTabs";
import PhonePush from "@/components/PhonePush";
import { Empty, PageHeader, Section } from "@/components/ui";
import { money, pct, signedMoney, toneOf } from "@/lib/format";
import type { WeeklyReport } from "@/lib/weekly";

export default function WeeklyPage() {
  const [list, setList] = useState<WeeklyReport[] | null>(null);
  useEffect(() => {
    fetch("/api/weekly")
      .then((r) => r.json())
      .then((j) => setList(j.reports ?? []))
      .catch(() => setList([]));
  }, []);

  return (
    <div className="space-y-5">
      <PerfTabs />
      <PageHeader
        title="주간 리포트"
        desc="매주 마지막 정규장이 끝나면(한국 시간 토요일 아침) 이번 주 추천 성적·모의투자·시장 상황·다음 주 실적 발표 일정을 한 장으로 정리합니다. 일주일에 한 번만 보셔도 됩니다."
      />
      {list === null ? (
        <div className="card h-56 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="card">
          <Empty>첫 주간 리포트는 이번 주 마지막 정규장이 끝난 뒤(한국 시간 토요일 아침) 자동으로 만들어집니다.</Empty>
        </div>
      ) : (
        <>
          <Report r={list[0]} latest />
          {list.length > 1 && (
            <Section title="지난 리포트">
              <div className="space-y-2">
                {list.slice(1).map((r) => (
                  <details key={r.id} className="rounded-lg border border-line">
                    <summary className="px-3 py-2 cursor-pointer select-none text-sm">
                      <b>{r.range}</b> <span className="text-muted">— {r.headline}</span>
                    </summary>
                    <div className="p-3 border-t border-line">
                      <Report r={r} />
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </>
      )}
      <div className="card p-4">
        <PhonePush />
        <p className="text-xs text-muted mt-2">구독하면 주간 리포트도 매주 휴대폰으로 받을 수 있습니다.</p>
      </div>
    </div>
  );
}

function Report({ r, latest = false }: { r: WeeklyReport; latest?: boolean }) {
  const dt = (t: number) => new Date(t * 1000).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
  return (
    <div className="space-y-4">
      {latest && (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <div className="text-xs text-accent">{r.range} 주간 리포트</div>
          <div className="text-lg font-semibold mt-1">{r.headline}</div>
          <div className="text-sm text-muted mt-1">{r.market.text}</div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Box title="시장 (S&P 500)">
          <div className={`text-2xl font-semibold num ${toneOf(r.market.spyWeek)}`}>{pct(r.market.spyWeek, 1)}</div>
          <div className="text-xs text-muted mt-1">
            200일선 {r.market.above200 == null ? "–" : r.market.above200 ? "위" : "아래"} · 50일선 {r.market.above50 == null ? "–" : r.market.above50 ? "위" : "아래"}
          </div>
        </Box>
        <Box title={<Link href="/paper" className="hover:text-accent">모의투자 →</Link>}>
          {r.paper ? (
            <>
              <div className={`text-2xl font-semibold num ${toneOf(r.paper.week)}`}>{pct(r.paper.week, 1)}</div>
              <div className="text-xs text-muted mt-1 num">
                자산 {money(r.paper.equity)} · 누적 <span className={toneOf(r.paper.total)}>{pct(r.paper.total, 1)}</span> (지수 {pct(r.paper.spyTotal, 1)})
              </div>
              <div className="text-xs text-muted num">
                이번 주 매수 {r.paper.buys} · 매도 {r.paper.sells} · 실현손익 <span className={toneOf(r.paper.realized)}>{signedMoney(r.paper.realized)}</span>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted">아직 시작 전</div>
          )}
        </Box>
        <Box title={<Link href="/track" className="hover:text-accent">추천 성적표 →</Link>}>
          <div className={`text-2xl font-semibold num ${toneOf(r.track.openAvg)}`}>{pct(r.track.openAvg, 1)}</div>
          <div className="text-xs text-muted mt-1">
            진행 중 추천 {r.track.open}건 평균 (같은 기간 지수 {pct(r.track.openSpy, 1)})
          </div>
        </Box>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Box title={`이번 주 추천 종료 (${r.track.closedThisWeek.length})`}>
          {r.track.closedThisWeek.length === 0 ? (
            <p className="text-sm text-muted">없음</p>
          ) : (
            <ul className="text-sm space-y-1">
              {r.track.closedThisWeek.map((c) => (
                <li key={c.symbol + c.reason} className="flex gap-2">
                  <Link href={`/analyze/${c.symbol}`} className="font-medium hover:text-accent">{c.name}</Link>
                  <span className={`num ${toneOf(c.ret)}`}>{pct(c.ret, 1)}</span>
                  <span className="text-xs text-muted truncate">{c.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title={`이번 주 새 추천 (${r.newPicks.length})`}>
          {r.newPicks.length === 0 ? (
            <p className="text-sm text-muted">없음</p>
          ) : (
            <ul className="text-sm space-y-1">
              {r.newPicks.map((p) => (
                <li key={p.symbol}>
                  <Link href={`/analyze/${p.symbol}`} className="font-medium hover:text-accent">{p.name}</Link>{" "}
                  <span className="text-xs text-muted">{p.symbol}{p.grade && ` · ${p.grade}`}{p.total != null && ` ${p.total}점`}</span>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title="다음 주 실적 발표 — 발표 전엔 새로 사지 않기">
          {r.earnings.length === 0 ? (
            <p className="text-sm text-muted">추천 종목 중 다음 주 실적 발표 없음</p>
          ) : (
            <ul className="text-sm space-y-1">
              {r.earnings.map((e) => (
                <li key={e.symbol}>
                  <span className="num text-warn">{dt(e.date)}</span> <Link href={`/analyze/${e.symbol}`} className="font-medium hover:text-accent">{e.name}</Link>
                </li>
              ))}
            </ul>
          )}
        </Box>
        <Box title="주말 기준 Top 10">
          <ol className="text-sm space-y-0.5 list-decimal pl-5">
            {r.top.map((p) => (
              <li key={p.symbol}>
                <Link href={`/analyze/${p.symbol}`} className="hover:text-accent">{p.name}</Link>{" "}
                <span className="text-xs text-muted num">{p.grade} {p.total}점</span>
              </li>
            ))}
          </ol>
        </Box>
      </div>
    </div>
  );
}

function Box({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="text-sm font-semibold mb-2">{title}</div>
      {children}
    </div>
  );
}
