"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import Ago from "@/components/Ago";
import Krw from "@/components/Krw";
import Term from "@/components/Term";
import { Empty, PageHeader, Section } from "@/components/ui";
import { money, pct, signedMoney, toneOf } from "@/lib/format";

interface Pos {
  symbol: string;
  name: string;
  sector: string | null;
  shares: number;
  avgCost: number;
  openedAt: number;
  stop: number;
  t1: number | null;
  t2: number | null;
  tranche: 1 | 2;
  plannedShares: number;
  halfSold: boolean;
  lastPrice: number;
}
interface Trade {
  at: number;
  symbol: string;
  name: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  fee: number;
  reason: string;
  pnl: number | null;
}
interface Point {
  day: string;
  equity: number;
  spy: number;
}
interface Resp {
  startCash: number;
  paper: { startedAt: number; updatedAt: number; cash: number; spyStart: number | null; positions: Pos[]; trades: Trade[]; history: Point[] } | null;
  summary: { equity: number; cash: number; invested: number; ret: number; spyRet: number | null; realized: number; sells: number; winRate: number | null; fees: number; mdd: number } | null;
}

const dt = (t: number) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function PaperPage() {
  const [d, setD] = useState<Resp | null>(null);
  useEffect(() => {
    fetch("/api/paper", { cache: "no-store" })
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);

  const p = d?.paper;
  const s = d?.summary;
  return (
    <div className="space-y-5">
      <PageHeader
        title="모의투자 — 사이트 규칙대로 따라 했다면"
        desc={
          <>
            가상의 $10,000로 이 사이트가 안내하는 규칙을 <b>그대로 자동 매매</b>합니다. &quot;추천 종목이 올랐나&quot;가 아니라 &quot;초보자가 규칙대로만 했으면 실제로 얼마를
            벌었나&quot;를 보여줍니다. 같은 날 같은 돈으로 <Term k="S&P 500" />을 산 경우와 비교하세요.
          </>
        }
      />

      {!d ? (
        <div className="card h-56 animate-pulse" />
      ) : !p || !s ? (
        <div className="card">
          <Empty>아직 시작 전입니다. 다음 전체 분석(미국 정규장 중 30분마다)부터 자동 매매가 시작됩니다.</Empty>
        </div>
      ) : (
        <>
          <div className="text-xs text-muted">
            {new Date(p.startedAt).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" })} 시작 · 마지막 매매 판단 <Ago t={p.updatedAt} />
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Card label="현재 자산" value={money(s.equity)} sub={<Krw usd={s.equity} paren={false} />} />
            <Card
              label="수익률 (수수료 포함)"
              value={<span className={toneOf(s.ret)}>{pct(s.ret, 2)}</span>}
              sub={
                <>
                  같은 기간 S&P 500 <span className={toneOf(s.spyRet)}>{pct(s.spyRet, 2)}</span>
                </>
              }
            />
            <Card
              label="매도 승률"
              value={s.winRate != null ? `${Math.round(s.winRate * 100)}%` : "–"}
              sub={
                <>
                  매도 {s.sells}회 · 실현손익 <span className={toneOf(s.realized)}>{signedMoney(s.realized)}</span>
                </>
              }
            />
            <Card label="최대 하락폭 (고점 대비)" value={<span className={s.mdd < 0 ? "text-down" : ""}>{pct(s.mdd, 1)}</span>} sub={`낸 수수료 ${money(s.fees)}`} />
          </div>

          <Verdict ret={s.ret} spyRet={s.spyRet} days={p.history.length} />

          <Section title="자산 추이 — 모의투자 vs S&P 500">
            <EquityChart history={p.history} start={d.startCash} spyStart={p.spyStart} />
          </Section>

          <Section title={`보유 종목 (${p.positions.length}) · 현금 ${money(p.cash)}`}>
            {p.positions.length === 0 ? (
              <p className="text-sm text-muted">지금은 보유 종목이 없습니다. 매수 구간에 들어온 추천이 생기면 자동으로 삽니다.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:-mx-5 -my-4 sm:-my-5">
                <table className="data min-w-[760px]">
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th className="text-right">수량 · 평단</th>
                      <th className="text-right">현재가</th>
                      <th className="text-right">평가손익</th>
                      <th className="text-right">손절 / 1차 / 2차 목표</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.positions.map((x) => {
                      const pl = (x.lastPrice - x.avgCost) * x.shares;
                      return (
                        <tr key={x.symbol}>
                          <td>
                            <Link href={`/analyze/${x.symbol}`} className="font-semibold hover:text-accent">{x.name}</Link>
                            <div className="text-xs text-muted">{x.symbol} · {x.sector ?? "–"} · {dt(x.openedAt)} 매수</div>
                          </td>
                          <td className="text-right num">{x.shares}주 · {money(x.avgCost)}</td>
                          <td className="text-right num">{money(x.lastPrice)}</td>
                          <td className={`text-right num ${toneOf(pl)}`}>
                            {signedMoney(pl)}
                            <div className="text-[11px]">{pct(((x.lastPrice - x.avgCost) / x.avgCost) * 100, 1)}</div>
                          </td>
                          <td className="text-right num text-xs">
                            <span className="text-bad">{money(x.stop)}</span> / {money(x.t1)} / {money(x.t2)}
                          </td>
                          <td className="text-xs text-muted">
                            {x.halfSold ? "1차 목표 달성 — 절반 매도, 손절가를 산 가격으로" : x.tranche === 1 ? `1차 매수 (계획 ${x.plannedShares}주 중)` : "2차 매수 완료"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section title={`매매 기록 (${p.trades.length})`}>
            {p.trades.length === 0 ? (
              <p className="text-sm text-muted">아직 매매가 없습니다.</p>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:-mx-5 -my-4 sm:-my-5">
                <table className="data min-w-[760px]">
                  <thead>
                    <tr>
                      <th>시각</th>
                      <th>종목</th>
                      <th>구분</th>
                      <th className="text-right">수량 · 가격</th>
                      <th className="text-right">실현손익</th>
                      <th>이유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.trades.slice(0, 100).map((t, i) => (
                      <tr key={`${t.at}-${t.symbol}-${i}`}>
                        <td className="text-xs num text-muted">{dt(t.at)}</td>
                        <td>
                          <Link href={`/analyze/${t.symbol}`} className="font-medium hover:text-accent">{t.name}</Link>
                        </td>
                        <td className={t.side === "buy" ? "text-up" : "text-down"}>{t.side === "buy" ? "매수" : "매도"}</td>
                        <td className="text-right num">{t.shares}주 · {money(t.price)}</td>
                        <td className={`text-right num ${toneOf(t.pnl)}`}>{t.pnl != null ? signedMoney(t.pnl) : "–"}</td>
                        <td className="text-xs text-muted">{t.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}

      <Section title="자동 매매 규칙 — 초보자 안내와 같습니다">
        <ul className="text-sm space-y-1.5 leading-relaxed">
          <li>• <b>살 때:</b> 추천 Top 10 중 &quot;지금 해야 할 일&quot;이 적극 매수 검토·분할 매수인 종목만. 몇 주 살지 계산기 수량의 절반을 먼저 사고, 다음 분석 이후에도 산 가격을 지키면 나머지를 삽니다.</li>
          <li>• <b>사지 않을 때:</b> 실적 발표 3일 전, 손익비 1 미만, 관찰·고평가 구간, 같은 업종 2종목 보유 중, 이미 5종목 보유 중, 최근 5일 안에 판 종목.</li>
          <li>• <b>팔 때:</b> 손절가 도달 → 전량. 1차 목표 도달 → 절반 팔고 손절가를 산 가격으로 올림. 2차 목표 도달 → 전량. 추천이 나쁜 이유(회피 신호·점수 하락 등)로 끝나면 → 전량. 60일 넘게 보유 → 전량.</li>
          <li>• <b>수량:</b> 손절가에 걸려도 자산의 1%만 잃도록, 한 종목은 자산의 20% 이하. 약세장이면 절반.</li>
          <li>• 매매는 30분마다 분석할 때의 가격으로 체결되며, 수수료 0.25%(사고팔 때 각각)를 뺍니다. 세금·환전 비용은 반영하지 않았습니다. 실제 매매에서는 가격이 조금씩 다를 수 있습니다.</li>
        </ul>
      </Section>
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-semibold num mt-1">{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5 num">{sub}</div>}
    </div>
  );
}

function Verdict({ ret, spyRet, days }: { ret: number; spyRet: number | null; days: number }) {
  if (days < 20 || spyRet == null)
    return (
      <div className="rounded-xl border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
        시작한 지 {days}일째입니다. 한 달(약 20거래일)은 지나야 &quot;규칙대로 하면 지수보다 나은가&quot;를 판단할 수 있습니다.
      </div>
    );
  const diff = ret - spyRet;
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${diff >= 0 ? "border-good/40 bg-good/5" : "border-warn/40 bg-warn/5"}`}>
      {days}일 동안 규칙대로 매매한 결과가 S&P 500보다 <b className="num">{diff >= 0 ? "+" : ""}{diff.toFixed(1)}%p</b> {diff >= 0 ? "높습니다." : "낮습니다. 모델 점검이 필요합니다."}
    </div>
  );
}

/** 두 선(모의투자·S&P 500)을 시작 시점 100으로 맞춰 비교 */
function EquityChart({ history, start, spyStart }: { history: Point[]; start: number; spyStart: number | null }) {
  if (history.length < 2 || !spyStart)
    return <p className="text-sm text-muted">기록이 이틀 이상 쌓이면 그래프가 그려집니다.</p>;
  const a = history.map((h) => (h.equity / start) * 100);
  const b = history.map((h) => (h.spy / spyStart) * 100);
  const all = [...a, ...b, 100];
  const lo = Math.min(...all) - 1;
  const hi = Math.max(...all) + 1;
  const W = 800;
  const H = 220;
  const x = (i: number) => (i / (history.length - 1)) * (W - 50) + 4;
  const y = (v: number) => H - 20 - ((v - lo) / (hi - lo)) * (H - 30);
  const line = (vs: number[]) => vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="모의투자와 S&P 500 자산 추이">
        <line x1={4} x2={W - 46} y1={y(100)} y2={y(100)} stroke="var(--color-line)" strokeDasharray="4 4" />
        <text x={W - 42} y={y(100) + 4} fontSize="11" fill="var(--color-muted)">100</text>
        <path d={line(b)} fill="none" stroke="var(--color-muted)" strokeWidth="2" />
        <path d={line(a)} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
        <text x={x(history.length - 1) - 4} y={y(a[a.length - 1]) - 6} fontSize="12" fill="var(--color-accent)" textAnchor="end">{a[a.length - 1].toFixed(1)}</text>
        <text x={x(history.length - 1) - 4} y={y(b[b.length - 1]) + 14} fontSize="12" fill="var(--color-muted)" textAnchor="end">{b[b.length - 1].toFixed(1)}</text>
        <text x={4} y={H - 4} fontSize="11" fill="var(--color-muted)">{history[0].day}</text>
        <text x={W - 50} y={H - 4} fontSize="11" fill="var(--color-muted)" textAnchor="end">{history[history.length - 1].day}</text>
      </svg>
      <div className="flex gap-4 text-xs mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-accent inline-block" /> 모의투자</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-muted inline-block" /> S&P 500 (같은 날 같은 돈으로 샀다면)</span>
        <span className="text-muted">시작 = 100</span>
      </div>
    </div>
  );
}
