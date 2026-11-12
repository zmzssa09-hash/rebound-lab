"use client";
import Ago from "@/components/Ago";
import Spark from "@/components/Spark";
import { Chip, PageHeader, RsiChip, Section, TONE_CLASS } from "@/components/ui";
import { pct, toneOf } from "@/lib/format";
import { useMarket } from "@/lib/useMarket";

const heat = (v: number | null) => {
  if (v == null) return "transparent";
  const a = Math.min(Math.abs(v) / 10, 1) * 0.45 + 0.05;
  return v >= 0 ? `rgba(242,92,92,${a})` : `rgba(78,140,255,${a})`;
};

export default function MarketPage() {
  const m = useMarket();

  return (
    <div className="space-y-5">
      <PageHeader title="미국 시장 흐름" desc="주요 지수, 업종별 흐름, 변동성, 시장 폭을 한눈에 봅니다. 과매도 종목이 시장 탓으로 떨어졌는지 판단하는 기준이 됩니다." />

      {!m ? (
        <div className="card h-64 animate-pulse" />
      ) : (
        <>
          <div className={`rounded-xl border p-5 ${TONE_CLASS[m.regime.tone]}`}>
            <div className="text-xs opacity-80">현재 시장 국면</div>
            <div className="text-2xl font-semibold mt-1">{m.regime.title}</div>
            <ul className="mt-3 space-y-1 text-sm text-text/90 leading-relaxed">
              {m.regime.points.map((p) => <li key={p}>• {p}</li>)}
            </ul>
            <p className="mt-3 text-sm text-text font-medium leading-relaxed">전략 시사점: {m.regime.strategy}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {m.indices.map((x) => (
              <div key={x.symbol} className="card p-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <div className="text-xs text-muted">{x.label}</div>
                    <div className="flex items-baseline gap-2 mt-1 num">
                      <span className="text-xl font-semibold">{x.symbol === "^TNX" ? `${x.price.toFixed(2)}%` : x.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                      <span className={`text-sm ${toneOf(x.chg1d)}`}>{pct(x.chg1d)}</span>
                    </div>
                  </div>
                  <Spark values={x.spark} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs num text-muted">
                  <span>1주 <span className={toneOf(x.chg1w)}>{pct(x.chg1w, 1)}</span></span>
                  <span>1개월 <span className={toneOf(x.chg1m)}>{pct(x.chg1m, 1)}</span></span>
                  <span>3개월 <span className={toneOf(x.chg3m)}>{pct(x.chg3m, 1)}</span></span>
                </div>
                {x.symbol !== "^VIX" && x.symbol !== "^TNX" && (
                  <div className="flex gap-1.5 mt-2">
                    <Chip tone={x.above50 ? "good" : "bad"}>50일선 {x.above50 ? "위" : "아래"}</Chip>
                    <Chip tone={x.above200 ? "good" : "bad"}>200일선 {x.above200 ? "위" : "아래"}</Chip>
                  </div>
                )}
                {x.symbol === "^VIX" && m.vixRatio != null && (
                  <div className="flex gap-1.5 mt-2">
                    <Chip tone={m.vixRatio < 1 ? "good" : "bad"}>
                      기간 구조 {m.vixRatio.toFixed(2)} · {m.vixRatio < 1 ? "콘탱고" : "백워데이션"}
                    </Chip>
                  </div>
                )}
              </div>
            ))}
          </div>

          <Section title="업종별 흐름 — 1개월 수익률 순">
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="data min-w-[720px]">
                <thead>
                  <tr>
                    <th>업종</th>
                    <th className="text-right">1일</th>
                    <th className="text-right">1주</th>
                    <th className="text-right">1개월</th>
                    <th className="text-right">3개월</th>
                    <th>RSI</th>
                    <th>추세</th>
                    <th>3개월 흐름</th>
                  </tr>
                </thead>
                <tbody>
                  {m.sectors.map((s) => (
                    <tr key={s.symbol}>
                      <td>
                        <span className="font-medium">{s.label}</span> <span className="text-xs text-muted">{s.symbol}</span>
                      </td>
                      {[s.chg1d, s.chg1w, s.chg1m, s.chg3m].map((v, i) => (
                        <td key={i} className="text-right num" style={{ background: heat(v) }}>{pct(v, 1)}</td>
                      ))}
                      <td><RsiChip value={s.rsi} /></td>
                      <td className="text-xs whitespace-nowrap">
                        {s.above200 && s.above50 ? <span className="text-good">상승</span> : !s.above200 && !s.above50 ? <span className="text-bad">하락</span> : <span className="text-warn">혼조</span>}
                      </td>
                      <td><Spark values={s.spark} width={100} height={24} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted mt-3">업종은 SPDR 업종 ETF 기준입니다. 빨강은 상승, 파랑은 하락이며 색이 진할수록 변동이 큽니다.</p>
          </Section>

          {m.breadth ? (
            <Section title="시장 폭 — 미국 주식 전체">
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "200일선 위 종목", v: m.breadth.above200, hint: "60% 이상이면 건강한 상승장" },
                  { label: "50일선 위 종목", v: m.breadth.above50, hint: "단기 체력" },
                  { label: "RSI 30 이하 (과매도)", v: m.breadth.oversold, hint: "높을수록 투매 국면" },
                  { label: "RSI 70 이상 (과매수)", v: m.breadth.overbought, hint: "높을수록 과열" },
                ].map((b) => (
                  <div key={b.label} className="rounded-lg border border-line p-3">
                    <div className="text-xs text-muted">{b.label}</div>
                    <div className="text-2xl font-semibold num mt-1">{b.v.toFixed(1)}%</div>
                    <div className="h-1.5 rounded bg-panel-2 mt-2 overflow-hidden">
                      <div className="h-full bg-accent" style={{ width: `${Math.min(b.v, 100)}%` }} />
                    </div>
                    <div className="text-[11px] text-muted mt-1.5">{b.hint}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-3">
                주가 $3 이상 미국 주식 {m.breadth.stocks.toLocaleString()}개 기준 ·{" "}
                마지막 스캔 <Ago t={m.breadth.scannedAt} />
              </p>
            </Section>
          ) : (
            <div className="card p-4 text-sm text-muted">시장 폭 데이터는 전 종목 스캔이 끝나면 표시됩니다.</div>
          )}
        </>
      )}
    </div>
  );
}
