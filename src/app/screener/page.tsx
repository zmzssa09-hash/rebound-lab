"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Chip, Empty, PageHeader, RsiChip, Stat, TONE_CLASS } from "@/components/ui";
import { TREND_LABEL } from "@/lib/analysis";
import { money, pct, toneOf } from "@/lib/format";
import { setData, uid, useAppData } from "@/lib/store";
import { bigMoneyKo, exchangeKo } from "@/lib/ko";
import type { Tone, Trend } from "@/lib/types";

interface Row {
  symbol: string;
  name: string;
  exchange: string;
  etf: boolean;
  price: number;
  changePct: number | null;
  rsi: number | null;
  trend: Trend;
  macdHist: number | null;
  macdImproving: boolean | null;
  drawdown52: number | null;
  dollarVolume: number | null;
  verdictTitle: string | null;
  verdictTone: Tone | null;
}

interface ScanResponse {
  status: { state: "idle" | "running" | "error"; phase: string; done: number; total: number; error: string | null };
  canScan?: boolean;
  scannedAt: number | null;
  universe: number;
  scanned: number;
  stats: { pool: number; oversold: number; oversoldPct: number; candidates: number; falling: number } | null;
  matched: number;
  rows: Row[];
}

const DV_OPTIONS = [
  { v: 0, label: "제한 없음" },
  { v: 1e6, label: "100만 달러 이상" },
  { v: 1e7, label: "1,000만 달러 이상" },
  { v: 5e7, label: "5,000만 달러 이상" },
];

const PAGE = 100;

const compact = bigMoneyKo;

export default function ScreenerPage() {
  const app = useAppData();
  const [f, setF] = useState({ rsiMax: 30, minPrice: 3, minDv: 1e6, type: "stock", trend: "", verdict: "", sort: "rsi", q: "" });
  const [limit, setLimit] = useState(PAGE);
  const [data, setResp] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const p = new URLSearchParams({
      rsiMax: String(f.rsiMax),
      minPrice: String(f.minPrice),
      minDv: String(f.minDv),
      type: f.type,
      trend: f.trend,
      verdict: f.verdict,
      sort: f.sort,
      q: f.q,
      limit: String(limit),
    });
    try {
      const r = await fetch(`/api/scan?${p}`);
      setResp(await r.json());
    } finally {
      setLoading(false);
    }
  }, [f, limit]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // 스캔 중이면 3초마다 진행 상황 갱신
  const running = data?.status.state === "running";
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [running, load]);

  const rescan = async () => {
    await fetch("/api/scan", { method: "POST" });
    load();
  };

  const watched = new Set(app.watchlist.map((w) => w.symbol));
  const addWatch = (symbol: string) =>
    setData((d) => (d.watchlist.some((w) => w.symbol === symbol) ? d : { ...d, watchlist: [...d.watchlist, { id: uid(), symbol, zones: [] }] }));

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setLimit(PAGE);
  };

  const st = data?.status;
  const progress = st && st.total > 0 ? (st.done / st.total) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="미국 전 종목 스크리너"
        desc="나스닥·뉴욕증권거래소·NYSE 아메리칸·NYSE 아카에 상장된 미국 종목 전체에서 RSI 과매도 종목을 찾고, 추세·MACD·거래량·지지선으로 함께 판정합니다. 결과는 반등 ‘후보’일 뿐 매수 신호가 아닙니다."
        actions={
          data?.canScan === false ? undefined : (
            <button className="btn" onClick={rescan} disabled={running}>
              {running ? "스캔 중…" : "지금 다시 스캔"}
            </button>
          )
        }
      />

      {/* 스캔 상태 */}
      {st && (running || st.state === "error" || !data?.scannedAt) && (
        <div className={`card p-4 ${st.state === "error" ? "border-bad/50" : ""}`}>
          {st.state === "error" ? (
            <p className="text-sm text-bad">스캔 실패: {st.error}</p>
          ) : (
            <>
              <div className="flex justify-between text-sm">
                <span>{st.phase || "준비 중"}</span>
                <span className="num text-muted">
                  {st.done.toLocaleString()} / {st.total.toLocaleString()}
                </span>
              </div>
              <div className="h-2 rounded bg-panel-2 mt-2 overflow-hidden">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-muted mt-2">
                전 종목 스캔은 2~4분 정도 걸립니다. {data?.scannedAt ? "완료되면 아래 결과가 자동으로 바뀝니다." : "처음 한 번만 기다리면 이후에는 저장된 결과를 바로 보여줍니다."}
              </p>
            </>
          )}
        </div>
      )}

      {data?.stats && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Stat label="스캔 종목 수" value={data.stats.pool.toLocaleString()} sub={`목록 ${data.universe.toLocaleString()}개 중 시세 확보 ${data.scanned.toLocaleString()}개`} />
          <Stat label="RSI ≤ 30 과매도" value={data.stats.oversold.toLocaleString()} sub={`전체의 ${data.stats.oversoldPct.toFixed(1)}%`} />
          <Stat label="반등 후보 (안정 신호 2개+)" value={data.stats.candidates.toLocaleString()} valueClass="text-good" />
          <Stat label="과매도 · 하락 진행 중" value={data.stats.falling.toLocaleString()} valueClass="text-bad" />
        </div>
      )}

      {/* 필터 */}
      <div className="card p-4 grid gap-3 grid-cols-2 md:grid-cols-4 lg:grid-cols-8 text-xs text-muted">
        <label className="flex flex-col gap-1 col-span-2">
          검색
          <input className="text-sm text-text" placeholder="티커·회사명 (한글 가능)" value={f.q} onChange={(e) => set("q", e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          RSI 이하
          <input type="number" min={1} max={100} className="text-sm text-text" value={f.rsiMax} onChange={(e) => set("rsiMax", Number(e.target.value) || 30)} />
        </label>
        <label className="flex flex-col gap-1">
          최소 주가 ($)
          <input type="number" min={0} step="0.5" className="text-sm text-text" value={f.minPrice} onChange={(e) => set("minPrice", Number(e.target.value) || 0)} />
        </label>
        <label className="flex flex-col gap-1">
          당일 거래대금
          <select className="text-sm text-text" value={f.minDv} onChange={(e) => set("minDv", Number(e.target.value))}>
            {DV_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          종류
          <select className="text-sm text-text" value={f.type} onChange={(e) => set("type", e.target.value)}>
            <option value="stock">주식</option>
            <option value="etf">ETF</option>
            <option value="all">전체</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          판정
          <select className="text-sm text-text" value={f.verdict} onChange={(e) => set("verdict", e.target.value)}>
            <option value="">전체</option>
            <option value="good">반등 후보</option>
            <option value="warn">추가 확인 필요</option>
            <option value="bad">하락 진행 중</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          정렬
          <select className="text-sm text-text" value={f.sort} onChange={(e) => set("sort", e.target.value)}>
            <option value="rsi">RSI 낮은 순</option>
            <option value="drawdown">52주 고점 대비 하락 큰 순</option>
            <option value="change">당일 하락 큰 순</option>
            <option value="dollarVolume">거래대금 큰 순</option>
          </select>
        </label>
      </div>

      {/* 결과 */}
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3 border-b border-line text-sm">
          <span className="font-semibold">
            결과 <span className="num">{data?.matched.toLocaleString() ?? "–"}</span>개
          </span>
          {data?.scannedAt && (
            <span className="text-xs text-muted">
              {new Date(data.scannedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} 스캔 · 1시간마다 자동 갱신
            </span>
          )}
        </div>
        {loading && !data ? (
          <div className="h-60 animate-pulse" />
        ) : !data?.scannedAt ? (
          <Empty>첫 스캔을 진행하고 있습니다. 완료되면 결과가 표시됩니다.</Empty>
        ) : data.rows.length === 0 ? (
          <Empty>조건에 맞는 종목이 없습니다. RSI 기준이나 거래대금 조건을 완화해 보세요.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="data min-w-[980px]">
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="text-right">현재가</th>
                  <th>RSI(14)</th>
                  <th>추세</th>
                  <th>MACD</th>
                  <th className="text-right">52주 고점 대비</th>
                  <th className="text-right">거래대금</th>
                  <th>판정</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.symbol}>
                    <td className="max-w-64">
                      <Link href={`/analyze/${r.symbol}`} className="font-semibold hover:text-accent">{r.symbol}</Link>
                      {r.etf && <span className="ml-1.5"><Chip>ETF</Chip></span>}
                      <div className="text-xs text-muted truncate">{r.name} · {exchangeKo(r.exchange)}</div>
                    </td>
                    <td className="text-right num">
                      {money(r.price)}
                      <div className={`text-xs ${toneOf(r.changePct)}`}>{pct(r.changePct)}</div>
                    </td>
                    <td><RsiChip value={r.rsi} /></td>
                    <td className={`whitespace-nowrap ${r.trend === "down" ? "text-bad" : r.trend === "up" ? "text-good" : "text-muted"}`}>{TREND_LABEL[r.trend]}</td>
                    <td>
                      {r.macdHist == null ? "–" : (
                        <span className={`whitespace-nowrap ${r.macdImproving ? "text-good" : "text-bad"}`}>
                          {r.macdHist >= 0 ? "양수" : "음수"} · {r.macdImproving ? "개선" : "악화"}
                        </span>
                      )}
                    </td>
                    <td className={`text-right num ${toneOf(r.drawdown52)}`}>{pct(r.drawdown52, 1)}</td>
                    <td className="text-right num text-muted">{compact(r.dollarVolume)}</td>
                    <td>
                      {r.verdictTitle && r.verdictTone ? (
                        <span className={`rounded-full border px-2 py-0.5 text-xs whitespace-nowrap ${TONE_CLASS[r.verdictTone]}`}>{r.verdictTitle}</span>
                      ) : (
                        <span className="text-xs text-muted">–</span>
                      )}
                    </td>
                    <td className="text-right">
                      {watched.has(r.symbol) ? (
                        <span className="text-xs text-muted">관심 중</span>
                      ) : (
                        <button className="text-xs text-accent whitespace-nowrap" onClick={() => addWatch(r.symbol)}>+ 관심</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.rows.length < data.matched && (
          <div className="p-3 text-center border-t border-line">
            <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
              더 보기 ({data.rows.length} / {data.matched})
            </button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted leading-relaxed">
        판정은 RSI 30 이하 종목에만 상세 계산됩니다(거래량·지지선 포함). 거래대금은 마지막 거래일 기준이며, 소형주·저가주는 변동성과 유동성 위험이 큽니다.
        워런트·우선주·유닛·테스트 종목은 제외했습니다.
      </p>
    </div>
  );
}
