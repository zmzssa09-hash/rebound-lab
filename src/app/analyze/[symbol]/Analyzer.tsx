"use client";
import Link from "next/link";
import { useMemo } from "react";
import PriceChart, { type PriceLineDef } from "@/components/PriceChart";
import Scorecard from "@/components/Scorecard";
import EtpWarning from "@/components/EtpWarning";
import { Chip, Section, TONE_CLASS, TONE_DOT } from "@/components/ui";
import { buildSignals, buildVerdict, computeSnapshot } from "@/lib/analysis";
import { marketTime, money, num, pct, signedMoney, toneOf } from "@/lib/format";
import { setData, uid, useAppData } from "@/lib/store";
import { exchangeKo, typeKo } from "@/lib/ko";
import { etpKind } from "@/lib/strategy";
import { useChart, useInsight } from "@/lib/useQuotes";
import DropReasonPanel from "@/components/DropReasonPanel";
import { GradeBoxes, ResiliencePanel, ValuationPanel } from "@/components/ValuationPanel";

export default function Analyzer({ symbol }: { symbol: string }) {
  const { data, error, loading } = useChart(symbol);
  const insight = useInsight(symbol);
  const app = useAppData();
  const position = app.positions.find((p) => p.symbol === symbol);
  const watch = app.watchlist.find((w) => w.symbol === symbol);

  const snap = useMemo(
    () => (data ? computeSnapshot(data.bars, data.meta.price, data.meta.previousClose) : null),
    [data],
  );
  const signals = useMemo(() => (snap ? buildSignals(snap) : []), [snap]);
  const verdict = useMemo(() => (snap ? buildVerdict(snap) : null), [snap]);

  const lines = useMemo<PriceLineDef[]>(() => {
    const out: PriceLineDef[] = [];
    if (position) {
      out.push({ price: position.avgCost, title: "평단", color: "#e6eaf2", dashed: true });
      if (position.target) out.push({ price: position.target, title: "목표", color: "#34d399" });
      if (position.stop) out.push({ price: position.stop, title: "손절", color: "#fb7185" });
    }
    watch?.zones.forEach((z) => {
      out.push({ price: z.high, title: z.label, color: "#6ea8fe", dashed: true });
      if (z.low !== z.high) out.push({ price: z.low, title: "", color: "#6ea8fe", dashed: true });
    });
    return out;
  }, [position, watch]);

  if (loading && !data) {
    return <div className="card h-96 animate-pulse" />;
  }
  if (error || !data || !snap || !verdict) {
    return (
      <div className="card p-8 text-center">
        <p className="text-bad font-medium">{error ?? "데이터를 불러오지 못했습니다."}</p>
        <p className="text-sm text-muted mt-2">티커를 확인해 주세요. 미국 상장 종목만 지원합니다.</p>
        <Link href="/analyze" className="btn mt-4">다른 종목 검색</Link>
      </div>
    );
  }

  const { meta } = data;
  const cur = meta.currency;
  const kind = etpKind(symbol);

  const addToWatch = () =>
    setData((d) => ({ ...d, watchlist: [...d.watchlist, { id: uid(), symbol, zones: [] }] }));

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>{exchangeKo(meta.exchange)}</span>
            {meta.instrumentType && <Chip>{typeKo(meta.instrumentType)}</Chip>}
          </div>
          <h1 className="text-2xl font-semibold mt-1">
            {meta.nameKo ? (
              <>
                {meta.nameKo} <span className="text-base font-normal text-muted">{symbol} · {meta.name}</span>
              </>
            ) : (
              <>
                {symbol} <span className="text-base font-normal text-muted">{meta.name}</span>
              </>
            )}
          </h1>
          <div className="flex items-baseline gap-3 mt-1 num">
            <span className="text-3xl font-semibold">{money(snap.price, cur)}</span>
            <span className={`text-lg ${toneOf(snap.changePct)}`}>{pct(snap.changePct)}</span>
            <span className="text-xs text-muted">{marketTime(meta.marketTime)} 기준 · 1분마다 자동 갱신</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {watch ? (
            <Link href="/watchlist" className="btn">관심 종목에서 보기</Link>
          ) : (
            <button className="btn" onClick={addToWatch}>+ 관심 종목</button>
          )}
          <Link href={`/positions?add=${symbol}&price=${snap.price.toFixed(2)}`} className="btn">
            {position ? "포지션 관리" : "+ 포지션"}
          </Link>
        </div>
      </div>

      {kind && <EtpWarning kind={kind} symbol={symbol} />}

      {/* 판정 */}
      <div className={`rounded-xl border p-5 ${TONE_CLASS[verdict.tone]}`}>
        <div className="text-xs uppercase tracking-wider opacity-80">기술적 판정</div>
        <div className="text-xl font-semibold mt-1">{verdict.title}</div>
        <p className="text-sm mt-1.5 text-text/90 leading-relaxed">{verdict.summary}</p>
        <p className="text-xs mt-3 text-muted">
          이 판정은 매수·매도 추천이 아닙니다. 과매도는 반등의 충분조건이 아니며, 장기 보유 여부는 아래 종목 평가표로 따로 판단합니다.
        </p>
      </div>

      {/* 단기·장기 등급 */}
      <GradeBoxes grades={insight.data?.grades ?? null} loading={insight.loading} />

      {/* 하락 이유 */}
      <DropReasonPanel
        drop={insight.data?.drop ?? null}
        fundamentals={insight.data?.fundamentals ?? null}
        sectorKo={insight.data?.sectorKo ?? null}
        loading={insight.loading}
      />

      {/* 신호 */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {signals.map((s) => (
          <div key={s.key} className="card p-4">
            <div className="flex items-center gap-2 text-xs text-muted">
              <span className={`w-2 h-2 rounded-full ${TONE_DOT[s.tone]}`} />
              {s.label}
            </div>
            <div className="font-semibold mt-1.5 num">{s.value}</div>
            <p className="text-xs text-muted mt-1.5 leading-relaxed">{s.detail}</p>
          </div>
        ))}
      </div>

      {/* 차트 */}
      <Section title="차트">
        <PriceChart bars={data.bars} lines={lines} />
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="주요 수치">
          <dl className="grid grid-cols-2 gap-y-2.5 text-sm num">
            <dt className="text-muted">52주 고가</dt>
            <dd className="text-right">{money(snap.high52, cur)}</dd>
            <dt className="text-muted">52주 저가</dt>
            <dd className="text-right">{money(snap.low52, cur)}</dd>
            <dt className="text-muted">52주 고점 대비</dt>
            <dd className={`text-right ${toneOf(snap.drawdown52)}`}>{pct(snap.drawdown52, 1)}</dd>
            <dt className="text-muted">20일선</dt>
            <dd className="text-right">{money(snap.sma20, cur)}</dd>
            <dt className="text-muted">50일선</dt>
            <dd className="text-right">{money(snap.sma50, cur)}</dd>
            <dt className="text-muted">200일선</dt>
            <dd className="text-right">{money(snap.sma200, cur)}</dd>
            <dt className="text-muted">20일 평균 거래량</dt>
            <dd className="text-right">{num(snap.vol20, 0)}</dd>
            <dt className="text-muted">3개월 저점</dt>
            <dd className="text-right">{money(snap.low3m, cur)}</dd>
          </dl>
        </Section>

        <Section title="내 계획" className="lg:col-span-2">
          {!position && !watch ? (
            <p className="text-sm text-muted">
              아직 이 종목에 대한 계획이 없습니다. 관심 종목에 추가해 가격대별 계획을 세우거나, 보유 중이면 포지션을 등록하세요.
            </p>
          ) : (
            <div className="space-y-4 text-sm">
              {position && (
                <div>
                  <div className="text-xs text-muted mb-1">보유 포지션</div>
                  <div className="flex flex-wrap gap-x-6 gap-y-1 num">
                    <span>{position.shares}주 · 평단 {money(position.avgCost, cur)}</span>
                    <span className={toneOf(snap.price - position.avgCost)}>
                      평가손익 {signedMoney((snap.price - position.avgCost) * position.shares, cur)} (
                      {pct(((snap.price - position.avgCost) / position.avgCost) * 100)})
                    </span>
                    {position.target && <span>목표 {money(position.target, cur)}</span>}
                    {position.stop && <span>손절 {money(position.stop, cur)}</span>}
                  </div>
                  {position.invalidation && <p className="text-muted mt-1">철회 조건: {position.invalidation}</p>}
                </div>
              )}
              {watch && watch.zones.length > 0 && (
                <div>
                  <div className="text-xs text-muted mb-1">가격대별 계획</div>
                  <ul className="space-y-1.5">
                    {watch.zones.map((z) => {
                      const inside = snap.price >= z.low && snap.price <= z.high;
                      return (
                        <li key={z.id} className="flex flex-wrap items-center gap-2">
                          <span className="num w-32">{money(z.low, cur)}~{money(z.high, cur)}</span>
                          <span className="font-medium">{z.label}</span>
                          {inside && <Chip tone="warn">현재 구간</Chip>}
                          <span className="text-muted">— {z.condition}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {watch?.note && <p className="text-muted">메모: {watch.note}</p>}
            </div>
          )}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <ValuationPanel v={insight.data?.valuation ?? null} price={snap.price} />
        <ResiliencePanel r={insight.data?.resilience ?? null} />
      </div>

      <Scorecard symbol={symbol} snap={snap} auto={insight.data?.auto ?? null} />
    </div>
  );
}
