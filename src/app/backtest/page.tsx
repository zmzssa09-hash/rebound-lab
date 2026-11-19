"use client";
import { useEffect, useState } from "react";
import PerfTabs from "@/components/PerfTabs";
import Term from "@/components/Term";
import { Empty, PageHeader, Section } from "@/components/ui";
import { pct, toneOf } from "@/lib/format";

interface Stats {
  n: number;
  winRate: number | null;
  avg: number | null;
  median: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  spyAvg: number | null;
  avgDays: number | null;
  stopRate: number | null;
  t1Rate: number | null;
}
interface Portfolio {
  start: number;
  end: number;
  cagr: number | null;
  totalRet: number;
  mdd: number;
  spyTotal: number | null;
  spyCagr: number | null;
  spyMdd: number | null;
  trades: number;
  avgInvested?: number;
  curve: { t: number; equity: number; spy: number }[];
}
interface Result {
  generatedAt: number;
  universe: number;
  from: number | null;
  to: number | null;
  variants: { key: string; label: string; stats: Stats }[];
  portfolio: Record<string, Portfolio>;
  byYear: { year: number; stats: Stats }[];
  buckets: { label: string; rows: { key: string; label: string; stats: Stats }[] }[];
}

const pr = (v: number | null) => (v == null ? "–" : `${Math.round(v * 100)}%`);
const ymd = (t: number | null) => (t ? new Date(t * 1000).toLocaleDateString("ko-KR", { year: "numeric", month: "short" }) : "–");
const PORT_LABEL: Record<string, string> = {
  site: "지금 사이트 규칙",
  noBear: "사이트 규칙 + 약세장엔 사지 않기",
  wide60: "넓은 손절 + 목표가, 최대 60일",
  wide20: "넓은 손절 + 목표가, 최대 20일",
  none20: "손절 없이 목표가, 최대 20일",
  sitePark: "사이트 규칙 + 남는 현금은 S&P 500 ETF",
  wide60Park: "넓은 손절(60일) + 남는 현금은 S&P 500 ETF",
};

export default function BacktestPage() {
  const [r, setR] = useState<Result | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/backtest")
      .then((x) => x.json())
      .then((j) => setR(j.result ?? null))
      .catch(() => setR(null));
  }, []);

  return (
    <div className="space-y-5">
      <PerfTabs />
      <PageHeader
        title="과거 검증 (백테스트)"
        desc="이 사이트의 매매 계획 계산 코드를 지난 10년 주가에 그대로 적용해, 규칙대로 했다면 어땠을지 계산했습니다. 좋은 결과든 나쁜 결과든 그대로 보여줍니다."
      />
      {r === undefined ? (
        <div className="card h-56 animate-pulse" />
      ) : r === null ? (
        <div className="card">
          <Empty>아직 검증 결과가 없습니다. 매달 1일 자동으로 계산됩니다.</Empty>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted">
            거래대금 상위 미국 주식 {r.universe}종목 · {ymd(r.from)} ~ {ymd(r.to)} · 계산일 {new Date(r.generatedAt).toLocaleDateString("ko-KR")}
          </div>

          <Summary r={r} />

          <Section title="규칙별 비교 — 거래 한 번당">
            <div className="overflow-x-auto -mx-4 sm:-mx-5 -my-4 sm:-my-5">
              <table className="data min-w-[860px]">
                <thead>
                  <tr>
                    <th>규칙</th>
                    <th className="text-right">거래 수</th>
                    <th className="text-right"><Term k="승률" /></th>
                    <th className="text-right">평균 수익</th>
                    <th className="text-right">같은 기간 S&P 500</th>
                    <th className="text-right">평균 이익 / 손실</th>
                    <th className="text-right">손절 비율</th>
                    <th className="text-right">평균 보유</th>
                  </tr>
                </thead>
                <tbody>
                  {r.variants.map((v) => (
                    <tr key={v.key} className={v.key === "site" ? "bg-accent/5" : ""}>
                      <td className="font-medium">{v.label}{v.key === "site" && <span className="text-xs text-accent ml-1">지금 사이트</span>}</td>
                      <td className="text-right num">{v.stats.n.toLocaleString()}</td>
                      <td className="text-right num">{pr(v.stats.winRate)}</td>
                      <td className={`text-right num font-semibold ${toneOf(v.stats.avg)}`}>{pct(v.stats.avg, 2)}</td>
                      <td className="text-right num text-muted">{v.key === "hold20" ? "–" : pct(v.stats.spyAvg, 2)}</td>
                      <td className="text-right num text-xs">
                        <span className="text-up">{pct(v.stats.avgWin, 1)}</span> / <span className="text-down">{pct(v.stats.avgLoss, 1)}</span>
                      </td>
                      <td className="text-right num">{v.key === "hold20" ? "–" : pr(v.stats.stopRate)}</td>
                      <td className="text-right num">{v.stats.avgDays != null ? `${Math.round(v.stats.avgDays)}일` : "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="$10,000로 규칙대로 운용했다면 — 포트폴리오 (최대 5종목, 손절 시 1% 손실, 종목당 20%)">
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="data min-w-[680px]">
                <thead>
                  <tr>
                    <th>규칙</th>
                    <th className="text-right">연평균 수익</th>
                    <th className="text-right">전체 수익</th>
                    <th className="text-right">최대 하락폭</th>
                    <th className="text-right">평균 투자 비중</th>
                    <th className="text-right">매매 수</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(r.portfolio).map(([k, p]) => (
                    <tr key={k} className={k === "site" ? "bg-accent/5" : ""}>
                      <td className="font-medium">{PORT_LABEL[k] ?? k}</td>
                      <td className={`text-right num font-semibold ${toneOf(p.cagr)}`}>{pct(p.cagr, 1)}</td>
                      <td className={`text-right num ${toneOf(p.totalRet)}`}>{pct(p.totalRet, 0)}</td>
                      <td className="text-right num text-down">{pct(p.mdd, 1)}</td>
                      <td className="text-right num">{p.avgInvested != null ? `${Math.round(p.avgInvested)}%` : "–"}</td>
                      <td className="text-right num">{p.trades}</td>
                    </tr>
                  ))}
                  {r.portfolio.site && (
                    <tr>
                      <td className="text-muted">비교: S&P 500 사서 그냥 보유</td>
                      <td className={`text-right num ${toneOf(r.portfolio.site.spyCagr)}`}>{pct(r.portfolio.site.spyCagr, 1)}</td>
                      <td className={`text-right num ${toneOf(r.portfolio.site.spyTotal)}`}>{pct(r.portfolio.site.spyTotal, 0)}</td>
                      <td className="text-right num text-down">{pct(r.portfolio.site.spyMdd, 1)}</td>
                      <td className="text-right num">100%</td>
                      <td className="text-right num">–</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-2">
              평균 투자 비중 = 종목에 들어가 있던 돈의 평균 비율. 나머지는 현금입니다. &lsquo;남는 현금은 S&P 500 ETF&rsquo; 규칙은 현금을 자산의 20%(한 종목 몫)만 남기고,
              30%를 넘으면 넘친 만큼 ETF를 사고, 종목을 살 현금이 모자라면 그만큼만 ETF를 팝니다 (ETF 매매 수수료 포함).
            </p>
            {r.portfolio.site && <Curve p={r.portfolio.site} />}
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            {r.buckets.map((b) => (
              <Section key={b.label} title={`지금 사이트 규칙 — ${b.label}`}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th className="text-right">거래</th>
                      <th className="text-right">승률</th>
                      <th className="text-right">평균</th>
                      <th className="text-right">S&P 500</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((x) => (
                      <tr key={x.key}>
                        <td>{x.label}</td>
                        <td className="text-right num">{x.stats.n}</td>
                        <td className="text-right num">{pr(x.stats.winRate)}</td>
                        <td className={`text-right num ${toneOf(x.stats.avg)}`}>{pct(x.stats.avg, 2)}</td>
                        <td className="text-right num text-muted">{pct(x.stats.spyAvg, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            ))}
            <Section title="지금 사이트 규칙 — 연도별">
              <table className="data">
                <thead>
                  <tr>
                    <th>연도</th>
                    <th className="text-right">거래</th>
                    <th className="text-right">승률</th>
                    <th className="text-right">평균</th>
                    <th className="text-right">S&P 500</th>
                  </tr>
                </thead>
                <tbody>
                  {r.byYear.map((y) => (
                    <tr key={y.year}>
                      <td className="num">{y.year}</td>
                      <td className="text-right num">{y.stats.n}</td>
                      <td className="text-right num">{pr(y.stats.winRate)}</td>
                      <td className={`text-right num ${toneOf(y.stats.avg)}`}>{pct(y.stats.avg, 2)}</td>
                      <td className="text-right num text-muted">{pct(y.stats.spyAvg, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          <Section title="이 검증의 한계">
            <ul className="text-sm space-y-1.5 leading-relaxed">
              <li>• <b>펀더멘털 필터는 검증하지 못했습니다.</b> 과거 시점의 재무제표·적정가 자료가 없어서, 매수 구간·회피 신호·장기 보유 기준 없이 &quot;과매도 + 손익비 1 이상&quot; 신호만 검증했습니다. 실제 사이트는 여기서 재무가 약한 종목을 더 걸러냅니다.</li>
              <li>• <b>생존 편향:</b> 지금 상장된 종목만 대상이라 그사이 상장폐지된 종목이 빠졌습니다. 실제 결과는 이보다 나쁠 수 있습니다.</li>
              <li>• 실적 발표일 회피 규칙도 과거 일정 자료가 없어 반영하지 못했습니다.</li>
              <li>• 신호 다음 날 시가에 사고, 같은 날 손절과 목표가에 모두 닿으면 손절이 먼저라고 가정했습니다(보수적). 수수료 0.25%씩 반영, 세금·환전 비용은 빠졌습니다.</li>
              <li>• 과거 성과가 미래 수익을 보장하지 않습니다.</li>
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}

/** 결과를 초보자 말로 요약 */
function Summary({ r }: { r: Result }) {
  const site = r.variants.find((v) => v.key === "site")?.stats;
  const best = [...r.variants].filter((v) => v.key !== "hold20").sort((a, b) => (b.stats.avg ?? -99) - (a.stats.avg ?? -99))[0];
  const p = r.portfolio.site;
  const park = r.portfolio.sitePark;
  if (!site || !p) return null;
  const edge = (site.avg ?? 0) - (site.spyAvg ?? 0);
  return (
    <div className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-4 text-sm leading-relaxed space-y-1.5">
      <div className="font-semibold text-base">한 줄 요약</div>
      <p>
        지금 사이트의 기술적 매매 규칙은 거래 한 번에 평균 <b className="num">{pct(site.avg, 2)}</b>로, 같은 기간 S&P 500(<span className="num">{pct(site.spyAvg, 2)}</span>)보다{" "}
        <b className="num">{edge >= 0 ? `${edge.toFixed(2)}%p 나았습니다` : `${(-edge).toFixed(2)}%p 못했습니다`}</b>. 매매의 {pr(site.stopRate)}가 <Term k="손절" />로 끝났습니다.
      </p>
      <p>
        $10,000로 운용했다면 연평균 <b className="num">{pct(p.cagr, 1)}</b>(S&P 500 <span className="num">{pct(p.spyCagr, 1)}</span>)였고, 최대 하락폭은{" "}
        <span className="num">{pct(p.mdd, 1)}</span>로 지수(<span className="num">{pct(p.spyMdd, 1)}</span>)보다 작았습니다 — 한 번에 조금씩만 투자하기 때문에 덜 벌고 덜 잃습니다.
      </p>
      {park && (
        <p>
          남는 현금을 S&P 500 ETF에 넣어 두면 연평균 <b className="num">{pct(park.cagr, 1)}</b>로 늘지만, 최대 하락폭도 <span className="num">{pct(park.mdd, 1)}</span>로
          지수만큼 커집니다. 그래도 S&P 500을 그냥 사서 들고 있는 것(<span className="num">{pct(p.spyCagr, 1)}</span>)보다는 낮았습니다. 과거 10년만 보면 지수를 그냥 들고 있는 것이 수익이 가장 높았으므로,{" "}
          <b>초보자라면 돈의 대부분은 지수 ETF에 두고 일부만 이 사이트 추천으로 매매하는 것</b>이 안전합니다.
        </p>
      )}
      {best && best.key !== "site" && (
        <p>
          비교한 규칙 중에서는 <b>{best.label}</b>이 거래당 평균 <b className="num">{pct(best.stats.avg, 2)}</b>(승률 {pr(best.stats.winRate)})로 가장 좋았습니다.
        </p>
      )}
    </div>
  );
}

function Curve({ p }: { p: Portfolio }) {
  const c = p.curve;
  if (c.length < 2) return null;
  const all = c.flatMap((x) => [x.equity, x.spy]);
  const lo = Math.min(...all) * 0.95;
  const hi = Math.max(...all) * 1.02;
  const W = 800;
  const H = 220;
  const x = (i: number) => (i / (c.length - 1)) * (W - 60) + 4;
  const y = (v: number) => H - 20 - ((v - lo) / (hi - lo)) * (H - 30);
  const line = (k: "equity" | "spy") => c.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v[k]).toFixed(1)}`).join(" ");
  const yr = (t: number) => new Date(t * 1000).getUTCFullYear();
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="백테스트 자산 추이">
        <path d={line("spy")} fill="none" stroke="var(--color-muted)" strokeWidth="1.8" />
        <path d={line("equity")} fill="none" stroke="var(--color-accent)" strokeWidth="2.2" />
        <text x={x(c.length - 1) + 4} y={y(c[c.length - 1].equity) + 4} fontSize="11" fill="var(--color-accent)">${(c[c.length - 1].equity / 1000).toFixed(1)}k</text>
        <text x={x(c.length - 1) + 4} y={y(c[c.length - 1].spy) + 4} fontSize="11" fill="var(--color-muted)">${(c[c.length - 1].spy / 1000).toFixed(1)}k</text>
        <text x={4} y={H - 4} fontSize="11" fill="var(--color-muted)">{yr(c[0].t)}</text>
        <text x={W - 60} y={H - 4} fontSize="11" fill="var(--color-muted)" textAnchor="end">{yr(c[c.length - 1].t)}</text>
      </svg>
      <div className="flex gap-4 text-xs mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent inline-block" /> 지금 사이트 규칙</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-muted inline-block" /> S&P 500 보유</span>
      </div>
    </div>
  );
}
