"use client";
import Ago from "@/components/Ago";
import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadSampleButton } from "@/components/DataTools";
import { Empty, RsiChip, Section, TONE_CLASS } from "@/components/ui";
import { TREND_LABEL, zoneStatus } from "@/lib/analysis";
import { daysUntil, money, pct, signedMoney, toneOf } from "@/lib/format";
import Spark from "@/components/Spark";
import { useMarket } from "@/lib/useMarket";
import { useAppData, useHydrated } from "@/lib/store";
import { CONCENTRATION_LIMIT, CORE_IDEA } from "@/lib/strategy";
import type { Pick, QuoteSummary, Tone } from "@/lib/types";
import { isQuote, useQuotes } from "@/lib/useQuotes";

const MARKET: string[] = [];

interface Breadth {
  scannedAt: number | null;
  status: { state: string; done: number; total: number; phase: string };
  stats: { pool: number; oversold: number; oversoldPct: number; candidates: number; falling: number } | null;
}

/** 시장 국면 + 주요 지수 */
function MarketStrip() {
  const m = useMarket();
  if (!m) return <div className="card h-28 animate-pulse" />;
  const keys = ["^GSPC", "^IXIC", "^RUT", "^VIX"];
  return (
    <Link href="/market" className="card p-4 sm:p-5 block hover:border-accent/50">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">미국 시장 흐름</span>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[m.regime.tone]}`}>{m.regime.title}</span>
        <span className="ml-auto text-xs text-accent">자세히 →</span>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mt-3">
        {keys.map((k) => {
          const x = m.indices.find((i) => i.symbol === k);
          if (!x) return null;
          return (
            <div key={k} className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted">{x.label}</div>
                <div className="num">
                  <span className="font-semibold">{x.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>{" "}
                  <span className={`text-xs ${toneOf(x.chg1d)}`}>{pct(x.chg1d)}</span>
                </div>
              </div>
              <Spark values={x.spark} width={70} height={26} />
            </div>
          );
        })}
      </div>
      <p className="text-sm text-text/85 mt-3 leading-relaxed">{m.regime.strategy}</p>
    </Link>
  );
}

/** 상위 추천 종목 */
function TopPicks() {
  const [picks, setPicks] = useState<Pick[] | null>(null);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/picks", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          setPicks(((j.top as Pick[] | null) ?? []).slice(0, 4));
          setScannedAt(j.scannedAt ?? null);
        })
        .catch(() => setPicks((p) => p ?? []));
    load();
    const t = setInterval(load, 60_000); // 실시간 가격 1분마다
    return () => clearInterval(t);
  }, []);
  return (
    <Section
      title="추천 종목 Top 4 · 실시간"
      right={
        <span className="flex items-center gap-3 text-xs">
          {scannedAt && (
            <span className="text-muted">
              분석 <Ago t={scannedAt} />
            </span>
          )}
          <Link href="/picks" className="text-accent">Top 10 전체 →</Link>
        </span>
      }
    >
      {picks == null ? (
        <div className="h-24 animate-pulse" />
      ) : picks.length === 0 ? (
        <p className="text-sm text-muted">추천 종목을 분석하고 있습니다. 잠시 후 추천 종목 페이지에서 확인하세요.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {picks.map((p) => (
            <Link key={p.symbol} href={`/analyze/${p.symbol}`} className="rounded-lg border border-line p-3 hover:border-accent/50">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{p.nameKo ?? p.name}</div>
                  <div className="text-xs text-muted">{p.symbol} · {p.sectorKo ?? "–"}</div>
                </div>
                <div className="num text-right">
                  <span className="text-lg font-semibold">{p.live?.total ?? p.total}</span>
                  <span className="text-xs text-muted">/100</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 text-xs num">
                <span>{money(p.live?.price ?? p.price)}</span> <span className={toneOf(p.live?.changePct ?? p.changePct)}>{pct(p.live?.changePct ?? p.changePct)}</span>
                <RsiChip value={p.live?.rsi ?? p.rsi} />
              </div>
              <div className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[11px] ${TONE_CLASS[p.dropTone]}`}>{p.dropNatureLabel}</div>
            </Link>
          ))}
        </div>
      )}
    </Section>
  );
}

/** 미국 전 종목 스캔 요약 */
function MarketBreadth() {
  const [b, setB] = useState<Breadth | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/scan?limit=0&minPrice=1")
        .then((r) => r.json())
        .then((j: Breadth) => {
          if (!alive) return;
          setB(j);
          if (j.status.state === "running") setTimeout(load, 5000);
        })
        .catch(() => {});
    load();
    return () => {
      alive = false;
    };
  }, []);
  if (!b) return null;
  const s = b.stats;
  return (
    <Link href="/screener" className="card px-4 sm:px-5 py-4 flex flex-wrap items-center gap-x-8 gap-y-3 hover:border-accent/50">
      <div>
        <div className="text-xs text-muted">미국 전 종목 과매도 현황</div>
        <div className="text-sm mt-0.5">
          {s ? (
            <>주식 <span className="num">{s.pool.toLocaleString()}</span>개 스캔</>
          ) : (
            <>첫 스캔 중… <span className="num">{b.status.done.toLocaleString()}/{b.status.total.toLocaleString()}</span></>
          )}
        </div>
      </div>
      {s && (
        <>
          <div className="num">
            <div className="text-xs text-muted">RSI ≤ 30</div>
            <div className="text-lg font-semibold">{s.oversold.toLocaleString()} <span className="text-xs text-muted font-normal">({s.oversoldPct.toFixed(1)}%)</span></div>
          </div>
          <div className="num">
            <div className="text-xs text-muted">반등 후보</div>
            <div className="text-lg font-semibold text-good">{s.candidates.toLocaleString()}</div>
          </div>
          <div className="num">
            <div className="text-xs text-muted">하락 진행 중</div>
            <div className="text-lg font-semibold text-bad">{s.falling.toLocaleString()}</div>
          </div>
        </>
      )}
      <span className="ml-auto text-sm text-accent">스크리너 열기 →</span>
    </Link>
  );
}

interface Alert {
  tone: Tone;
  symbol: string;
  text: string;
}

export default function Dashboard() {
  const app = useAppData();
  const hydrated = useHydrated();
  const mySymbols = Array.from(new Set([...app.positions.map((p) => p.symbol), ...app.watchlist.map((w) => w.symbol)]));
  const { quotes, loading, fetchedAt, refresh } = useQuotes([...MARKET, ...mySymbols]);
  const q = (s: string) => (isQuote(quotes[s]) ? (quotes[s] as QuoteSummary) : null);

  // 포트폴리오
  const rows = app.positions.map((p) => {
    const price = q(p.symbol)?.price ?? null;
    const value = price != null ? price * p.shares : p.avgCost * p.shares;
    return { p, price, value, pl: price != null ? (price - p.avgCost) * p.shares : null };
  });
  const total = rows.reduce((a, r) => a + r.value, 0) + app.cash;
  const cost = app.positions.reduce((a, p) => a + p.avgCost * p.shares, 0);
  const pl = rows.every((r) => r.pl != null) ? rows.reduce((a, r) => a + (r.pl ?? 0), 0) : null;

  // 알림
  const alerts: Alert[] = [];
  for (const r of rows) {
    const { p, price } = r;
    if (price != null && p.stop && price <= p.stop) alerts.push({ tone: "bad", symbol: p.symbol, text: `손절가 ${money(p.stop)} 이탈 — 철회 조건을 재검토하세요.` });
    if (price != null && p.target && price >= p.target) alerts.push({ tone: "good", symbol: p.symbol, text: `목표가 ${money(p.target)} 도달.` });
    else if (price != null && p.target && (p.target - price) / price <= 0.03)
      alerts.push({ tone: "warn", symbol: p.symbol, text: `목표가까지 ${(((p.target - price) / price) * 100).toFixed(1)}% 남음.` });
    if (!p.stop) alerts.push({ tone: "warn", symbol: p.symbol, text: "손절 기준이 없습니다." });
    if (p.deadline) {
      const d = daysUntil(p.deadline);
      if (d < 0) alerts.push({ tone: "bad", symbol: p.symbol, text: `보유 기한이 ${-d}일 지났습니다. 보유 이유를 다시 판단하세요.` });
      else if (d <= 3) alerts.push({ tone: "warn", symbol: p.symbol, text: `보유 기한 D-${d}.` });
    }
    if (total > 0 && (r.value / total) * 100 > CONCENTRATION_LIMIT)
      alerts.push({ tone: "bad", symbol: p.symbol, text: `포트폴리오의 ${((r.value / total) * 100).toFixed(0)}%가 한 종목에 집중되어 있습니다.` });
  }
  for (const w of app.watchlist) {
    const price = q(w.symbol)?.price ?? null;
    for (const z of w.zones) {
      if (zoneStatus(price, z).text === "현재 구간")
        alerts.push({ tone: "warn", symbol: w.symbol, text: `‘${z.label}’(${money(z.low)}~${money(z.high)}) 진입 — 조건: ${z.condition || "확인 필요"}` });
    }
  }

  const radar = mySymbols
    .map((s) => q(s))
    .filter((x): x is QuoteSummary => !!x)
    .sort((a, b) => (a.rsi ?? 999) - (b.rsi ?? 999));

  const isEmpty = hydrated && app.positions.length === 0 && app.watchlist.length === 0;

  return (
    <div className="space-y-5">
      {isEmpty && (
        <div className="card p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">떨어진 이유까지 확인하는 과매도 미국 주식 추천</h1>
          <p className="text-muted mt-2 max-w-3xl leading-relaxed">{CORE_IDEA}</p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-3 text-sm">
            <li className="rounded-lg border border-line p-3"><b>1. 과매도 찾기</b><br /><span className="text-muted">미국 전 종목에서 RSI 30 이하를 찾고 추세·MACD·거래량·지지선으로 판정합니다.</span></li>
            <li className="rounded-lg border border-line p-3"><b>2. 하락 이유 걸러내기</b><br /><span className="text-muted">실적 발표·뉴스·시장 대비 성과로 왜 떨어졌는지 설명하고, 매출 감소·현금흐름 악화는 제외합니다.</span></li>
            <li className="rounded-lg border border-line p-3"><b>3. 100점 평가표</b><br /><span className="text-muted">단기 반등에 실패해도 장기 보유할 만한 기업만 점수순으로 추천합니다.</span></li>
          </ul>
          <div className="flex flex-wrap gap-2 mt-5">
            <Link href="/picks" className="btn btn-primary">추천 종목 보기</Link>
            <Link href="/market" className="btn">시장 흐름</Link>
            <LoadSampleButton />
          </div>
        </div>
      )}

      <MarketStrip />
      <TopPicks />
      <MarketBreadth />

      {!isEmpty && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">내 대시보드</h1>
            <button className="btn" onClick={refresh} disabled={loading}>
              {loading ? "불러오는 중…" : <>시세 새로고침{fetchedAt && <> · <Ago t={fetchedAt} /></>}</>}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Section title="포트폴리오" right={<Link href="/positions" className="text-xs text-accent">관리 →</Link>}>
              {app.positions.length === 0 ? (
                <p className="text-sm text-muted">등록된 포지션이 없습니다.</p>
              ) : (
                <>
                  <div className="num">
                    <div className="text-xs text-muted">총 자산</div>
                    <div className="text-2xl font-semibold">{money(total)}</div>
                    <div className={`text-sm ${toneOf(pl)}`}>
                      {signedMoney(pl)} {pl != null && cost > 0 && `(${pct((pl / cost) * 100)})`}
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {rows.map((r) => {
                      const w = total > 0 ? (r.value / total) * 100 : 0;
                      return (
                        <div key={r.p.id}>
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{r.p.symbol}</span>
                            <span className="num text-muted">{w.toFixed(1)}%</span>
                          </div>
                          <div className="h-1.5 rounded bg-panel-2 mt-1 overflow-hidden">
                            <div className={`h-full ${w > CONCENTRATION_LIMIT ? "bg-bad" : "bg-accent"}`} style={{ width: `${Math.min(w, 100)}%` }} />
                          </div>
                        </div>
                      );
                    })}
                    {app.cash > 0 && (
                      <div className="flex justify-between text-sm text-muted">
                        <span>현금</span>
                        <span className="num">{((app.cash / total) * 100).toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </Section>

            <Section title="확인할 일" className="lg:col-span-2">
              {alerts.length === 0 ? (
                <p className="text-sm text-muted">지금 확인할 알림이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {alerts.map((a, i) => (
                    <li key={i} className={`rounded-lg border px-3 py-2 text-sm flex gap-2 ${TONE_CLASS[a.tone]}`}>
                      <Link href={`/analyze/${a.symbol}`} className="font-semibold shrink-0 hover:underline">{a.symbol}</Link>
                      <span className="text-text/90">{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="과매도 레이더 — 내 종목 RSI 낮은 순" right={<Link href="/watchlist" className="text-xs text-accent">관심 종목 →</Link>}>
            {radar.length === 0 ? (
              loading ? <div className="h-24 animate-pulse" /> : <Empty>시세를 불러오지 못했습니다.</Empty>
            ) : (
              <div className="overflow-x-auto -mx-4 sm:-mx-5">
                <table className="data min-w-[720px]">
                  <thead>
                    <tr>
                      <th>종목</th>
                      <th className="text-right">현재가</th>
                      <th>RSI(14)</th>
                      <th>추세</th>
                      <th>MACD</th>
                      <th>판정</th>
                    </tr>
                  </thead>
                  <tbody>
                    {radar.map((x) => (
                      <tr key={x.symbol}>
                        <td>
                          <Link href={`/analyze/${x.symbol}`} className="font-semibold hover:text-accent">{x.symbol}</Link>
                          <div className="text-xs text-muted truncate max-w-48">{x.nameKo ?? x.name}</div>
                        </td>
                        <td className="text-right num">
                          {money(x.price, x.currency)}
                          <div className={`text-xs ${toneOf(x.changePct)}`}>{pct(x.changePct)}</div>
                        </td>
                        <td><RsiChip value={x.rsi} /></td>
                        <td className={x.trend === "down" ? "text-bad" : x.trend === "up" ? "text-good" : "text-muted"}>{TREND_LABEL[x.trend]}</td>
                        <td className="text-sm">
                          {x.macdHist == null ? "–" : (
                            <span className={x.macdImproving ? "text-good" : "text-bad"}>
                              {x.macdHist >= 0 ? "양수" : "음수"} · {x.macdImproving ? "개선" : "악화"}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${TONE_CLASS[x.verdict.tone]}`}>{x.verdict.title}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted mt-3">RSI 30 이하만 ‘과매도’로 분류합니다. RSI 40대는 과매도가 아닙니다.</p>
          </Section>
        </>
      )}
    </div>
  );
}
