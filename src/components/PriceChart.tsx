"use client";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { macd, rsi, sma, type Series } from "@/lib/indicators";
import type { Bar } from "@/lib/types";

export interface PriceLineDef {
  price: number;
  title: string;
  color: string;
  dashed?: boolean;
}

const RANGES = [
  { key: "3개월", bars: 63 },
  { key: "6개월", bars: 126 },
  { key: "1년", bars: 252 },
  { key: "2년", bars: 9999 },
] as const;

const UP = "#f25c5c";
const DOWN = "#4e8cff";

export default function PriceChart({ bars, lines = [] }: { bars: Bar[]; lines?: PriceLineDef[] }) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("6개월");

  useEffect(() => {
    if (!el.current || bars.length === 0) return;
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#8b95a8",
        fontSize: 11,
        panes: { separatorColor: "#232c3d", enableResize: false },
      },
      grid: { vertLines: { color: "#161d2a" }, horzLines: { color: "#161d2a" } },
      rightPriceScale: { borderColor: "#232c3d" },
      timeScale: { borderColor: "#232c3d" },
      crosshair: { mode: 0 },
      localization: { locale: "ko-KR" },
    });
    chartRef.current = chart;

    const t = (b: Bar) => b.time as UTCTimestamp;
    const closes = bars.map((b) => b.close);
    const toLine = (s: Series) =>
      s.flatMap((v, i) => (v == null ? [] : [{ time: t(bars[i]), value: v }]));

    // 가격 + 이동평균
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });
    candle.setData(bars.map((b) => ({ time: t(b), open: b.open, high: b.high, low: b.low, close: b.close })));
    const maDefs: [number, string][] = [
      [20, "#fbbf24"],
      [50, "#a78bfa"],
      [200, "#34d399"],
    ];
    for (const [n, color] of maDefs) {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        title: `${n}일선`,
      });
      s.setData(toLine(sma(closes, n)));
    }
    for (const l of lines) {
      if (!Number.isFinite(l.price) || l.price <= 0) continue;
      candle.createPriceLine({
        price: l.price,
        color: l.color,
        lineWidth: 1,
        lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
        axisLabelVisible: true,
        title: l.title,
      });
    }

    // 거래량 (가격 패널 하단 오버레이)
    const vol = chart.addSeries(HistogramSeries, {
      priceScaleId: "vol",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    vol.setData(
      bars.map((b, i) => ({
        time: t(b),
        value: b.volume,
        color: (i > 0 && b.close < bars[i - 1].close ? DOWN : UP) + "55",
      })),
    );

    // RSI 패널
    const rsiS = chart.addSeries(
      LineSeries,
      { color: "#6ea8fe", lineWidth: 2, priceLineVisible: false, title: "RSI" },
      1,
    );
    rsiS.setData(toLine(rsi(closes, 14)));
    rsiS.createPriceLine({ price: 30, color: "#34d399", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });
    rsiS.createPriceLine({ price: 70, color: "#fb7185", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "" });

    // MACD 패널
    const m = macd(closes);
    const hist = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 2);
    hist.setData(
      m.hist.flatMap((v, i) => {
        if (v == null) return [];
        const prev = m.hist[i - 1] ?? v;
        const color = v >= 0 ? (v >= prev ? "#f25c5c" : "#f25c5c88") : v >= prev ? "#4e8cff88" : "#4e8cff";
        return [{ time: t(bars[i]), value: v, color }];
      }),
    );
    chart
      .addSeries(LineSeries, { color: "#e6eaf2", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "MACD" }, 2)
      .setData(toLine(m.macd));
    chart
      .addSeries(LineSeries, { color: "#fbbf24", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, title: "시그널" }, 2)
      .setData(toLine(m.signal));

    const panes = chart.panes();
    panes[0]?.setStretchFactor(3);
    panes[1]?.setStretchFactor(1);
    panes[2]?.setStretchFactor(1);

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [bars, lines]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || bars.length === 0) return;
    const n = RANGES.find((r) => r.key === range)!.bars;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - n), to: bars.length + 2 });
  }, [range, bars, lines]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-2 text-xs">
        <div className="flex rounded-lg border border-line overflow-hidden">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`px-2.5 py-1 ${range === r.key ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {r.key}
            </button>
          ))}
        </div>
        <Legend color="#fbbf24" label="20일선" />
        <Legend color="#a78bfa" label="50일선" />
        <Legend color="#34d399" label="200일선" />
        <span className="text-muted">· 아래: RSI(14일) / MACD(12·26·9일)</span>
      </div>
      <div ref={el} className="w-full h-[560px]" />
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-muted">
      <span className="w-3 h-0.5 rounded" style={{ background: color }} />
      {label}
    </span>
  );
}
