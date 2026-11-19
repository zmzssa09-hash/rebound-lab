"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import Ago from "@/components/Ago";
import PerfTabs from "@/components/PerfTabs";
import Term from "@/components/Term";
import { Chip, Empty, PageHeader, Section } from "@/components/ui";
import { money, pct, toneOf } from "@/lib/format";
import type { FilterStats } from "@/lib/filterTrack";

interface Point {
  price: number;
  spy: number;
  at: number;
}
interface Rec {
  id: string;
  symbol: string;
  name: string;
  nameKo: string | null;
  pickedAt: number;
  entry: number;
  spyEntry: number | null;
  grade: string | null;
  total: number | null;
  w1: Point | null;
  w4: Point | null;
  exit: (Point & { reason: string }) | null;
  last: Point | null;
}
interface PStats {
  n: number;
  winRate: number | null;
  avg: number | null;
  median: number | null;
  spyAvg: number | null;
  beatRate: number | null;
}
interface Resp {
  updatedAt: number;
  startedAt: number | null;
  stats: { total: number; open: number; closed: number; w1: PStats; w4: PStats; exit: PStats; current: PStats };
  records: Rec[];
  filter?: FilterStats;
}

const r = (a: number, b: number) => ((b - a) / a) * 100;
const pr = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const date = (t: number) => new Date(t).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });

export default function TrackPage() {
  const [data, setData] = useState<Resp | null>(null);
  useEffect(() => {
    fetch("/api/track", { cache: "no-store" })
      .then((x) => x.json())
      .then(setData)
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-5">
      <PerfTabs />
      <PageHeader
        title="추천 성적표"
        desc={
          <>
            Top 10에 들어온 모든 종목의 실제 결과를 자동으로 기록합니다. 추천 당시 가격에서 1주 뒤·4주 뒤·추천이 끝난 시점까지 얼마나 벌었는지, 같은 기간
            <Term k="S&P 500"> S&P 500</Term>을 그냥 산 것보다 나았는지 확인하세요. 좋은 결과만 골라 보여주지 않습니다.
          </>
        }
      />

      {!data ? (
        <div className="card h-48 animate-pulse" />
      ) : data.records.length === 0 ? (
        <div className="card">
          <Empty>아직 기록이 없습니다. 다음 전체 분석부터 추천 종목이 자동으로 기록됩니다.</Empty>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted">
            {data.startedAt && <>{new Date(data.startedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}부터 기록 · </>}
            추천 {data.stats.total}건 · 진행 중 {data.stats.open} · 종료 {data.stats.closed} · 마지막 기록 <Ago t={data.updatedAt} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="1주 뒤" s={data.stats.w1} pending="추천 1주가 지나면 계산됩니다" />
            <StatCard title="4주 뒤" s={data.stats.w4} pending="추천 4주가 지나면 계산됩니다" />
            <StatCard title="추천 종료 시점" s={data.stats.exit} pending="아직 종료된 추천이 없습니다" />
            <StatCard title="진행 중 (현재)" s={data.stats.current} pending="진행 중인 추천이 없습니다" />
          </div>
          <Verdict s={data.stats} />

          <Section title="전체 기록">
            <div className="overflow-x-auto -mx-4 sm:-mx-5 -my-4 sm:-my-5">
              <table className="data min-w-[860px]">
                <thead>
                  <tr>
                    <th>종목</th>
                    <th>추천일 · 등급</th>
                    <th className="text-right">추천가</th>
                    <th className="text-right">1주 뒤</th>
                    <th className="text-right">4주 뒤</th>
                    <th className="text-right">종료 / 현재</th>
                    <th className="text-right">S&P 500 대비</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((x) => {
                    const end = x.exit ?? x.last;
                    const ret = end ? r(x.entry, end.price) : null;
                    const spy = end && x.spyEntry ? r(x.spyEntry, end.spy) : null;
                    return (
                      <tr key={x.id}>
                        <td>
                          <Link href={`/analyze/${x.symbol}`} className="font-semibold hover:text-accent">{x.nameKo ?? x.name}</Link>
                          <div className="text-xs text-muted">{x.symbol}</div>
                        </td>
                        <td className="text-xs num">
                          {date(x.pickedAt)}
                          {x.grade && <span className="text-muted"> · {x.grade}{x.total != null && ` ${x.total}점`}</span>}
                        </td>
                        <td className="text-right num">{money(x.entry)}</td>
                        <Cell entry={x.entry} pt={x.w1} />
                        <Cell entry={x.entry} pt={x.w4} />
                        <td className={`text-right num ${toneOf(ret)}`}>{pct(ret, 1)}</td>
                        <td className={`text-right num ${toneOf(ret != null && spy != null ? ret - spy : null)}`}>
                          {ret != null && spy != null ? `${ret - spy > 0 ? "+" : ""}${(ret - spy).toFixed(1)}%p` : "–"}
                          {spy != null && <div className="text-[10px] text-muted">지수 {pct(spy, 1)}</div>}
                        </td>
                        <td className="text-xs">
                          {x.exit ? (
                            <span className="text-muted">
                              {date(x.exit.at)} 종료 — {x.exit.reason}
                            </span>
                          ) : (
                            <Chip tone="good">진행 중</Chip>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
          {data.filter && <FilterCheck f={data.filter} />}
          <p className="text-xs text-muted leading-relaxed">
            추천가는 그 종목이 Top 10에 처음 들어온 분석 시점의 가격입니다. 1주·4주 뒤는 추천일로부터 7일·28일이 지난 뒤 첫 거래일 종가, 종료는 Top 10에서 빠진
            분석 시점의 가격입니다. 수수료·세금·환율은 반영하지 않았습니다. 과거 성과가 미래 수익을 보장하지 않습니다.
          </p>
        </>
      )}
    </div>
  );
}

function Cell({ entry, pt }: { entry: number; pt: Point | null }) {
  if (!pt) return <td className="text-right text-xs text-muted">대기</td>;
  const v = r(entry, pt.price);
  return <td className={`text-right num ${toneOf(v)}`}>{pct(v, 1)}</td>;
}

function StatCard({ title, s, pending }: { title: string; s: PStats; pending: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{title} <span className="num">({s.n}건)</span></div>
      {s.n === 0 ? (
        <div className="text-sm text-muted mt-2">{pending}</div>
      ) : (
        <>
          <div className={`text-2xl font-semibold num mt-1 ${toneOf(s.avg)}`}>{pct(s.avg, 1)}</div>
          <div className="text-xs text-muted mt-0.5">평균 수익률 · 중앙값 {pct(s.median, 1)}</div>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <div>
              <div className="text-muted"><Term k="승률" /></div>
              <div className="num font-medium">{pr(s.winRate)}</div>
            </div>
            <div>
              <div className="text-muted">지수보다 나음</div>
              <div className="num font-medium">{pr(s.beatRate)}</div>
            </div>
          </div>
          <div className="text-[11px] text-muted mt-1.5">같은 기간 S&P 500 평균 <span className={`num ${toneOf(s.spyAvg)}`}>{pct(s.spyAvg, 1)}</span></div>
        </>
      )}
    </div>
  );
}

/** 한 줄 평가 */
function Verdict({ s }: { s: Resp["stats"] }) {
  const base = s.w4.n >= 10 ? { p: s.w4, k: "4주" } : s.w1.n >= 10 ? { p: s.w1, k: "1주" } : null;
  if (!base)
    return (
      <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
        아직 기록이 적어 성과를 판단하기 이릅니다. 1주·4주 결과가 각각 10건 이상 쌓이면 &quot;이 전략이 지수보다 나은가&quot;를 여기서 평가합니다.
      </div>
    );
  const excess = (base.p.avg ?? 0) - (base.p.spyAvg ?? 0);
  const good = excess > 0 && (base.p.winRate ?? 0) >= 0.5;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${good ? "border-good/40 bg-good/5" : "border-warn/40 bg-warn/5"}`}>
      추천 {base.k} 뒤 평균 수익률은 S&P 500보다 <b className="num">{excess > 0 ? "+" : ""}{excess.toFixed(1)}%p</b> {excess > 0 ? "높습니다" : "낮습니다"} (승률 {pr(base.p.winRate)}, {base.p.n}건).
      {!good && " 모델 점검이 필요합니다."}
    </div>
  );
}

/** 필터 검증: 추천한 종목 vs 걸러낸 종목 */
function FilterCheck({ f }: { f: FilterStats }) {
  const k = f.passed.w4.n >= 20 && f.cut.w4.n >= 20 ? "w4" : "w1";
  const a = f.passed[k];
  const b = f.cut[k];
  const ready = a.n >= 20 && b.n >= 20;
  const diff = (a.avg ?? 0) - (b.avg ?? 0);
  return (
    <Section title="필터 검증 — 추천한 종목 vs 걸러낸 종목">
      <p className="text-sm text-muted leading-relaxed mb-3">
        이 사이트는 과매도 종목 중 <b>회피 신호</b>(적자 확대·현금 소진 등)가 있거나 <b>장기 보유 기준</b>에 못 미치는 종목을 걸러냅니다. 이 필터가 정말 손실을
        막아 주는지, 걸러낸 종목도 똑같이 기록해 비교합니다. 과매도(RSI 30 이하)로 분석한 종목을 28일에 한 번씩 기록합니다.
      </p>
      <div
        className={`rounded-lg border px-3 py-2.5 text-sm mb-3 ${!ready ? "border-line bg-panel-2 text-muted" : diff > 0 ? "border-good/40 bg-good/5" : "border-warn/40 bg-warn/5"}`}
      >
        {!ready ? (
          <>아직 기록이 적어 판단하기 이릅니다. 양쪽 모두 1주 결과가 20건 이상 쌓이면 여기서 평가합니다.</>
        ) : diff > 0 ? (
          <>
            필터를 통과한 종목이 걸러낸 종목보다 {k === "w4" ? "4주" : "1주"} 뒤 평균 <b className="num">{diff.toFixed(1)}%p</b> 더 좋았습니다 — 필터가 제 몫을 하고 있습니다.
          </>
        ) : (
          <>
            걸러낸 종목이 오히려 평균 <b className="num">{(-diff).toFixed(1)}%p</b> 더 좋았습니다 — 필터가 좋은 종목까지 버리고 있을 수 있어 기준 점검이 필요합니다.
          </>
        )}
      </div>
      <div className="overflow-x-auto -mx-4 sm:-mx-5">
        <table className="data min-w-[720px]">
          <thead>
            <tr>
              <th>그룹</th>
              <th className="text-right">기록</th>
              <th className="text-right">1주 뒤 평균</th>
              <th className="text-right">4주 뒤 평균</th>
              <th className="text-right">4주 <Term k="승률" /></th>
              <th className="text-right">같은 기간 지수 (4주)</th>
              <th className="text-right">지금까지 (4주 전)</th>
            </tr>
          </thead>
          <tbody>
            {f.groups.map((g) => (
              <tr key={g.key} className={g.key === "top" ? "bg-accent/5" : ""}>
                <td>
                  <div className="font-medium">{g.label}</div>
                  <div className="text-[11px] text-muted">{g.desc}</div>
                </td>
                <td className="text-right num">{g.n}</td>
                <td className={`text-right num ${toneOf(g.w1.avg)}`}>{g.w1.n ? <>{pct(g.w1.avg, 1)} <span className="text-[10px] text-muted">({g.w1.n})</span></> : "대기"}</td>
                <td className={`text-right num ${toneOf(g.w4.avg)}`}>{g.w4.n ? <>{pct(g.w4.avg, 1)} <span className="text-[10px] text-muted">({g.w4.n})</span></> : "대기"}</td>
                <td className="text-right num">{g.w4.n ? pr(g.w4.winRate) : "–"}</td>
                <td className={`text-right num text-muted`}>{g.w4.n ? pct(g.w4.spyAvg, 1) : "–"}</td>
                <td className={`text-right num ${toneOf(g.current.avg)}`}>{g.current.n ? pct(g.current.avg, 1) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">
        {f.startedAt ? `${new Date(f.startedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })}부터 기록 · ` : ""}
        총 {f.total}건. 가격은 기록한 분석 시점 기준이며 수수료는 반영하지 않았습니다. &lsquo;지금까지&rsquo;는 4주가 안 된 기록의 현재까지 수익률입니다.
      </p>
    </Section>
  );
}
