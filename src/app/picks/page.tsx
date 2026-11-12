"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { KIND_TONE } from "@/components/DropReasonPanel";
import { Chip, Empty, PageHeader, RsiChip, TONE_CLASS } from "@/components/ui";
import { money, pct, toneOf } from "@/lib/format";
import { bigMoneyKo } from "@/lib/ko";
import { SCORE_ITEMS } from "@/lib/scorecard";
import { setData, uid, useAppData } from "@/lib/store";
import type { Pick, PickExit } from "@/lib/types";

interface PicksResponse {
  status: { state: string; phase: string; done: number; total: number; error: string | null };
  scannedAt: number | null;
  nextScanAt: number | null;
  marketOpen: boolean;
  top: Pick[] | null;
  excluded: Pick[];
  exits: PickExit[];
  candidates: number;
  serverTime: number;
}

const SHORT: Record<string, string> = {
  growth: "실적",
  discount: "할인",
  balance: "재무",
  technical: "과매도",
  catalyst: "촉매",
  downside: "안전",
};

const LIVE_MS = 60_000;
const hm = (t: number) => new Date(t).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
const dhm = (t: number) => new Date(t).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function PicksPage() {
  const [data, setResp] = useState<PicksResponse | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const app = useAppData();
  const watched = new Set(app.watchlist.map((w) => w.symbol));

  const load = useCallback(async () => {
    try {
      const j = (await (await fetch("/api/picks", { cache: "no-store" })).json()) as PicksResponse;
      setResp(j);
      setUpdatedAt(Date.now());
    } catch {
      /* 다음 주기에 재시도 */
    }
  }, []);

  // 1분마다 실시간 갱신 (분석 중이면 5초마다 진행률 확인)
  const running = data?.status.state === "running";
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const t = setInterval(load, running ? 5_000 : LIVE_MS);
    return () => clearInterval(t);
  }, [load, running]);

  const addWatch = (symbol: string) =>
    setData((d) => (d.watchlist.some((w) => w.symbol === symbol) ? d : { ...d, watchlist: [...d.watchlist, { id: uid(), symbol, zones: [] }] }));

  const top = data?.top ?? [];
  const st = data?.status;

  return (
    <div className="space-y-5">
      <PageHeader
        title="추천 종목 Top 10"
        desc="RSI 30 이하로 떨어진 미국 주식 중 하락 이유를 확인하고 100점 평가표로 채점해, 단기 반등에 실패해도 장기 보유할 만한 기업만 골랐습니다. 한 번 추천된 종목은 조건이 유지되는 한 순위를 지킵니다."
      />

      {/* 상태 줄 */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${data?.marketOpen ? "bg-good animate-pulse" : "bg-muted"}`} />
          <span className="text-text font-medium">{data?.marketOpen ? "실시간 · 장중" : "장 마감 · 마지막 가격 기준"}</span>
          {updatedAt && <span className="num">· 가격 {hm(updatedAt)} 갱신 (1분마다)</span>}
        </span>
        {data?.scannedAt && <span className="num">전체 분석 {hm(data.scannedAt)}</span>}
        {data?.nextScanAt && !running && <span className="num">다음 분석 {hm(Math.max(data.nextScanAt, data.serverTime))}</span>}
        {data && data.candidates > 0 && <span className="num">과매도 후보 {data.candidates}개 평가</span>}
        {running && st && (
          <span className="flex items-center gap-2 ml-auto min-w-56">
            <span className="text-accent">{st.phase}</span>
            <span className="flex-1 h-1.5 rounded bg-panel-2 overflow-hidden">
              <span className="block h-full bg-accent transition-all" style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} />
            </span>
          </span>
        )}
      </div>
      {st?.state === "error" && <div className="card p-4 text-sm text-bad">분석 실패: {st.error} — 다음 주기에 다시 시도합니다.</div>}

      {!data ? (
        <div className="card h-64 animate-pulse" />
      ) : top.length === 0 ? (
        <div className="card">
          <Empty>{running ? "첫 분석을 진행하고 있습니다. 끝나면 Top 10이 표시됩니다 (5분 안팎)." : data.scannedAt == null ? "첫 분석 결과를 기다리고 있습니다. 매시간 자동으로 분석됩니다." : "지금은 추천 조건(65점 이상, 장기 보유 기준 통과)을 만족하는 종목이 없습니다."}</Empty>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {top.map((p) => (
            <PickCard key={p.symbol} p={p} watched={watched.has(p.symbol)} onWatch={() => addWatch(p.symbol)} />
          ))}
        </div>
      )}

      {data && data.exits.length > 0 && (
        <details className="card">
          <summary className="px-4 sm:px-5 py-3 cursor-pointer select-none font-semibold text-[15px]">
            Top 10에서 빠진 종목 <span className="text-muted font-normal text-sm">({data.exits.length}) — 반등 완료·조건 탈락 이력</span>
          </summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="data min-w-[720px]">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>추천 기간</th>
                  <th className="text-right">추천가 → 이탈가</th>
                  <th className="text-right">수익률</th>
                  <th>빠진 이유</th>
                </tr>
              </thead>
              <tbody>
                {data.exits.map((e) => {
                  const r = ((e.exitPrice - e.firstPrice) / e.firstPrice) * 100;
                  return (
                    <tr key={`${e.symbol}-${e.exitedAt}`}>
                      <td>
                        <Link href={`/analyze/${e.symbol}`} className="font-semibold hover:text-accent">{e.nameKo ?? e.symbol}</Link>
                        <div className="text-xs text-muted">{e.symbol} · 최고 {e.bestRank}위</div>
                      </td>
                      <td className="text-xs text-muted num">{dhm(e.firstPickedAt)} ~ {dhm(e.exitedAt)}</td>
                      <td className="text-right num">{money(e.firstPrice)} → {money(e.exitPrice)}</td>
                      <td className={`text-right num ${toneOf(r)}`}>{pct(r, 1)}</td>
                      <td className="text-xs">{e.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {data && data.excluded.length > 0 && (
        <details className="card">
          <summary className="px-4 sm:px-5 py-3 cursor-pointer select-none font-semibold text-[15px]">
            걸러진 과매도 종목 <span className="text-muted font-normal text-sm">({data.excluded.length}) — RSI가 낮아도 피하는 이유</span>
          </summary>
          <div className="overflow-x-auto border-t border-line">
            <table className="data min-w-[720px]">
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="text-right">현재가</th>
                  <th>RSI</th>
                  <th>하락 성격</th>
                  <th>걸러진 이유</th>
                </tr>
              </thead>
              <tbody>
                {data.excluded.map((p) => (
                  <tr key={p.symbol}>
                    <td>
                      <Link href={`/analyze/${p.symbol}`} className="font-semibold hover:text-accent">{p.nameKo ?? p.symbol}</Link>
                      <div className="text-xs text-muted">{p.symbol} · {p.sectorKo ?? "–"}</div>
                    </td>
                    <td className="text-right num">{money(p.price)}</td>
                    <td><RsiChip value={p.rsi} /></td>
                    <td><span className={`rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap ${TONE_CLASS[p.dropTone]}`}>{p.dropNatureLabel}</span></td>
                    <td className="text-xs text-muted">{p.excludeReason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <p className="text-xs text-muted leading-relaxed">
        가격과 가격에 따라 바뀌는 점수(기술적 과매도·할인율)는 1분마다, 하락 이유·재무를 포함한 전체 분석은 1시간마다 갱신됩니다. 추천은 공개 데이터로
        자동 계산한 결과이며 투자 권유가 아닙니다. 대상: 주가 $3 이상, 당일 거래대금 200만 달러 이상인 미국 상장 주식(한국 기업 제외).
      </p>
    </div>
  );
}

function RankMove({ p }: { p: Pick }) {
  if (p.prevRank == null) return <span className="text-[11px] font-semibold text-accent">신규</span>;
  const d = p.prevRank - (p.rank ?? 0);
  if (d > 0) return <span className="text-[11px] text-up num">▲{d}</span>;
  if (d < 0) return <span className="text-[11px] text-down num">▼{-d}</span>;
  return <span className="text-[11px] text-muted">–</span>;
}

function PickCard({ p, watched, onWatch }: { p: Pick; watched: boolean; onWatch: () => void }) {
  const price = p.live?.price ?? p.price;
  const total = p.live?.total ?? p.total;
  const rsi = p.live?.rsi ?? p.rsi;
  const chg = p.live?.changePct ?? p.changePct;
  const upside = p.fairValue ? ((p.fairValue - price) / price) * 100 : null;
  const since = p.firstPrice ? ((price - p.firstPrice) / p.firstPrice) * 100 : null;

  return (
    <div className="card p-4 sm:p-5 flex flex-col">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center w-8 shrink-0">
          <span className="text-xl font-semibold num leading-none">{p.rank}</span>
          <RankMove p={p} />
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/analyze/${p.symbol}`} className="text-lg font-semibold hover:text-accent">{p.nameKo ?? p.name}</Link>
          <div className="text-xs text-muted truncate">
            {p.symbol} · {p.sectorKo ?? "–"} · 시가총액 {bigMoneyKo(p.marketCap)}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="num">
            <span className="text-2xl font-semibold">{total}</span>
            <span className="text-muted text-sm">/100</span>
          </div>
          {p.live && p.live.total !== p.total && <div className="text-[10px] text-muted num">분석 시점 {p.total}점</div>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm num">
        <span className="font-semibold">{money(price)}</span>
        <span className={toneOf(chg)}>{pct(chg)}</span>
        <RsiChip value={rsi} />
        {upside != null && (
          <span className="text-muted text-xs">
            목표가 ${p.fairValue!.toFixed(2)} (<span className={toneOf(upside)}>{pct(upside, 0)}</span>)
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE_CLASS[p.gradeTone]}`}>{p.grade}</span>
        {(p.streak ?? 0) > 1 && <Chip tone="good">{p.streak}회 연속 추천</Chip>}
        {p.firstPickedAt && (
          <Chip>
            {dhm(p.firstPickedAt)} 추천
            {since != null && (p.streak ?? 0) > 1 && <span className={`num ${toneOf(since)}`}> {pct(since, 1)}</span>}
          </Chip>
        )}
      </div>

      <div className="grid grid-cols-6 gap-1.5 mt-3">
        {SCORE_ITEMS.map((it) => {
          const v = p.scores[it.key];
          const f = v != null ? (v / it.max) * 100 : 0;
          return (
            <div key={it.key} title={`${it.label} ${v ?? "–"}/${it.max}`}>
              <div className="h-1.5 rounded bg-panel-2 overflow-hidden">
                <div className={`h-full ${f >= 70 ? "bg-good" : f >= 45 ? "bg-warn" : "bg-bad"}`} style={{ width: `${f}%` }} />
              </div>
              <div className="text-[10px] text-muted mt-1 text-center num">{SHORT[it.key]} {v ?? "–"}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-line p-3 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium">왜 떨어졌나</span>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${TONE_CLASS[p.dropTone]}`}>{p.dropNatureLabel}</span>
          {p.tags.map((t) => <Chip key={t.label} tone={KIND_TONE[t.kind]}>{t.label}</Chip>)}
        </div>
        <ul className="mt-2 space-y-1 text-xs text-text/85 leading-relaxed">
          {p.dropBullets.slice(1, 4).map((b) => <li key={b}>• {b}</li>)}
        </ul>
      </div>

      <div className="flex justify-between items-center mt-3">
        <Link href={`/analyze/${p.symbol}`} className="text-sm text-accent">상세 분석·뉴스 보기 →</Link>
        {watched ? <span className="text-xs text-muted">관심 종목에 있음</span> : <button className="text-xs text-accent" onClick={onWatch}>+ 관심 종목</button>}
      </div>
    </div>
  );
}
