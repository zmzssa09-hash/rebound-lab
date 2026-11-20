"use client";
// 홈 맨 위: 오늘 할 일 (추천 Top 10 + 내 보유 종목을 세 줄로)
import Link from "next/link";
import { useEffect, useState } from "react";
import { money } from "@/lib/format";
import { pickVerdict } from "@/lib/simple";
import type { Pick, Position } from "@/lib/types";

interface Item {
  symbol: string;
  name: string;
  note?: string;
}

function Row({ dot, title, items, empty, tone }: { dot: string; title: string; items: Item[]; empty: string; tone: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-line first:border-t-0">
      <span className="text-lg leading-none mt-0.5">{dot}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <b className={tone}>{title}</b> <span className="text-muted num">{items.length ? `${items.length}개` : ""}</span>
        </div>
        {items.length === 0 ? (
          <div className="text-xs text-muted mt-0.5">{empty}</div>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {items.map((x) => (
              <Link key={x.symbol} href={`/analyze/${x.symbol}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs hover:border-accent/60">
                <b>{x.name}</b>
                {x.note && <span className="text-muted"> · {x.note}</span>}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodayPanel({ positions, priceOf }: { positions: Position[]; priceOf: (symbol: string) => number | null }) {
  const [top, setTop] = useState<Pick[] | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/picks", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => setTop((j.top as Pick[] | null) ?? []))
        .catch(() => setTop((t) => t ?? []));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (top == null) return <div className="card h-36 animate-pulse" />;

  const name = (p: Pick) => p.nameKo ?? p.name;
  const v = top.map((p) => ({ p, v: pickVerdict(p) }));
  const buy: Item[] = v.filter((x) => x.v.key === "buy").map((x) => ({ symbol: x.p.symbol, name: name(x.p), note: `${money(x.v.price)} · 손절 ${money(x.v.stop)}` }));
  const wait: Item[] = v
    .filter((x) => x.v.key === "wait")
    .slice(0, 5)
    .map((x) => ({
      symbol: x.p.symbol,
      name: name(x.p),
      note:
        x.v.act.title === "실적 발표 대기"
          ? `실적 발표 D-${x.v.earningsDays}`
          : x.v.buyAt != null && x.v.buyAt < x.v.price
            ? `${money(x.v.buyAt)} 이하에서`
            : x.v.act.title === "관찰" && /손익비/.test(x.v.act.text)
              ? "반등 공간이 작아 기다림"
              : x.v.act.title,
    }));

  // 조심할 것: 내 보유 종목(손절가·목표가) + 추천 종목 중 손절선 근처
  const careful: Item[] = [];
  const good: Item[] = [];
  for (const pos of positions) {
    const price = priceOf(pos.symbol) ?? top.find((p) => p.symbol === pos.symbol)?.live?.price ?? null;
    if (price == null) continue;
    if (pos.stop && price <= pos.stop) careful.push({ symbol: pos.symbol, name: pos.symbol, note: `보유 · 손절가 ${money(pos.stop)} 아래 — 정리 검토` });
    else if (pos.stop && price <= pos.stop * 1.03) careful.push({ symbol: pos.symbol, name: pos.symbol, note: `보유 · 손절가 ${money(pos.stop)} 근처` });
    if (pos.target && price >= pos.target) good.push({ symbol: pos.symbol, name: pos.symbol, note: `보유 · 목표가 ${money(pos.target)} 도달 — 절반 이익 실현 검토` });
  }
  for (const x of v) if (x.v.nearStop || x.v.act.title === "손절선 이탈") careful.push({ symbol: x.p.symbol, name: name(x.p), note: x.v.act.title === "손절선 이탈" ? "손절선 아래" : `손절가 ${money(x.v.stop)} 근처` });

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-baseline gap-2">
        <h2 className="font-semibold text-[15px]">오늘 할 일</h2>
        <span className="text-xs text-muted">추천 Top 10과 내 보유 종목 기준 · 1분마다 갱신</span>
        <Link href="/picks" className="ml-auto text-xs text-accent shrink-0">
          추천 종목 →
        </Link>
      </div>
      <div className="mt-2">
        <Row dot="🟢" tone="text-good" title="살 만한 종목" items={buy} empty="지금 매수 구간에 들어온 추천 종목이 없습니다. 오늘은 사지 않고 기다려도 됩니다." />
        {good.length > 0 && <Row dot="🎯" tone="text-good" title="목표가 도달" items={good} empty="" />}
        <Row dot="🟡" tone="text-warn" title="기다릴 종목" items={wait} empty="가격이 더 내려오길 기다리는 종목이 없습니다." />
        <Row dot="🔴" tone="text-bad" title="조심할 종목" items={careful} empty="손절선 근처에 있는 종목이 없습니다." />
      </div>
      {positions.length === 0 && (
        <p className="text-[11px] text-muted mt-2">
          <Link href="/positions" className="text-accent">보유 종목</Link>에 산 종목과 손절가를 적어 두면, 손절선·목표가에 닿을 때 여기에 함께 표시됩니다.
        </p>
      )}
    </div>
  );
}
