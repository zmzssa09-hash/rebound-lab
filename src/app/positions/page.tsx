"use client";
import Ago from "@/components/Ago";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import EtpWarning from "@/components/EtpWarning";
import SwitchCalculator from "@/components/SwitchCalculator";
import { Chip, Empty, PageHeader, Section, Stat } from "@/components/ui";
import { daysUntil, money, pct, signedMoney, toneOf } from "@/lib/format";
import { setData, uid, useAppData, useHydrated } from "@/lib/store";
import { CONCENTRATION_LIMIT, etpKind } from "@/lib/strategy";
import type { Position } from "@/lib/types";
import { isQuote, useQuotes } from "@/lib/useQuotes";

export default function PositionsPage() {
  return (
    <Suspense>
      <Positions />
    </Suspense>
  );
}

function Positions() {
  const app = useAppData();
  const hydrated = useHydrated();
  const params = useSearchParams();
  const addSym = params.get("add")?.toUpperCase();
  const existing = addSym ? app.positions.find((p) => p.symbol === addSym) : undefined;
  const [editing, setEditing] = useState<Position | "new" | null>(null);
  const [prefillUsed, setPrefillUsed] = useState(false);

  const { quotes, loading, fetchedAt, refresh } = useQuotes(app.positions.map((p) => p.symbol));

  // 분석 페이지에서 "+ 포지션"으로 들어온 경우 폼 자동 오픈
  const formTarget: Position | "new" | null =
    editing ?? (hydrated && addSym && !prefillUsed ? (existing ?? "new") : null);

  const rows = app.positions.map((p) => {
    const q = quotes[p.symbol];
    const price = isQuote(q) ? q.price : null;
    const value = price != null ? price * p.shares : null;
    const cost = p.avgCost * p.shares;
    return { p, q, price, value, cost, pl: value != null ? value - cost : null };
  });
  const invested = rows.reduce((a, r) => a + (r.value ?? r.cost), 0);
  const total = invested + app.cash;
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const totalPl = rows.every((r) => r.pl != null) ? rows.reduce((a, r) => a + (r.pl ?? 0), 0) : null;
  const heavy = rows.filter((r) => total > 0 && ((r.value ?? r.cost) / total) * 100 > CONCENTRATION_LIMIT);
  const etps = Array.from(new Set(app.positions.map((p) => p.symbol))).filter((s) => etpKind(s));

  const closeForm = () => {
    setEditing(null);
    setPrefillUsed(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="포지션 & 매매 계획"
        desc="진입 근거·철회 조건·보유 기간을 함께 기록합니다. 목표가뿐 아니라 최대 손실과 현금 비중을 매수 전에 정하는 것이 원칙입니다."
        actions={
          <>
            <button className="btn" onClick={refresh} disabled={loading}>
              {loading ? "불러오는 중…" : <>시세 새로고침{fetchedAt && <> · <Ago t={fetchedAt} /></>}</>}
            </button>
            <button className="btn btn-primary" onClick={() => setEditing("new")}>+ 포지션 추가</button>
          </>
        }
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat label="총 자산 (평가 + 현금)" value={money(total)} />
        <Stat label="투자 원금" value={money(totalCost)} />
        <Stat
          label="평가손익"
          value={signedMoney(totalPl)}
          valueClass={toneOf(totalPl)}
          sub={totalPl != null && totalCost > 0 ? pct((totalPl / totalCost) * 100) : undefined}
        />
        <div className="card px-4 py-3">
          <div className="text-xs text-muted">현금</div>
          <div className="flex items-center gap-1 mt-1">
            <span className="text-muted">$</span>
            <input
              type="number"
              min={0}
              step="0.01"
              className="w-full text-lg font-semibold num py-0.5"
              value={hydrated ? app.cash || "" : ""}
              placeholder="0"
              onChange={(e) => setData((d) => ({ ...d, cash: Math.max(0, Number(e.target.value) || 0) }))}
            />
          </div>
          <div className="text-xs text-muted mt-0.5 num">비중 {total > 0 ? ((app.cash / total) * 100).toFixed(1) : "0"}%</div>
        </div>
      </div>

      {heavy.length > 0 && (
        <div className="rounded-xl border border-bad/40 bg-bad/5 p-4 text-sm">
          <span className="font-semibold text-bad">집중 위험: </span>
          {heavy.map((r) => `${r.p.symbol} ${(((r.value ?? r.cost) / total) * 100).toFixed(0)}%`).join(", ")} — 한 종목 비중이{" "}
          {CONCENTRATION_LIMIT}%를 넘습니다. 일부 매도, 손절 기준, 시간 제한을 미리 정해 두세요.
        </div>
      )}

      {formTarget && (
        <PositionForm
          key={formTarget === "new" ? "new" : formTarget.id}
          initial={formTarget === "new" ? undefined : formTarget}
          prefill={formTarget === "new" && addSym ? { symbol: addSym, avgCost: Number(params.get("price")) || undefined } : undefined}
          onClose={closeForm}
        />
      )}

      <Section title="보유 포지션">
        {!hydrated ? (
          <div className="h-24 animate-pulse" />
        ) : rows.length === 0 ? (
          <Empty>
            보유 포지션이 없습니다. <button className="text-accent" onClick={() => setEditing("new")}>포지션 추가</button>
          </Empty>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5">
            <table className="data min-w-[900px]">
              <thead>
                <tr>
                  <th>종목</th>
                  <th className="text-right">수량 / 평단</th>
                  <th className="text-right">현재가</th>
                  <th className="text-right">평가손익</th>
                  <th className="text-right">목표 도달 시</th>
                  <th className="text-right">손절 시</th>
                  <th>기한</th>
                  <th className="text-right">비중</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ p, q, price, value, cost, pl }) => {
                  const cur = isQuote(q) ? q.currency : "USD";
                  const weight = total > 0 ? ((value ?? cost) / total) * 100 : 0;
                  const tgtPl = p.target ? (p.target - p.avgCost) * p.shares : null;
                  const stopPl = p.stop ? (p.stop - p.avgCost) * p.shares : null;
                  const toTarget = p.target && price ? ((p.target - price) / price) * 100 : null;
                  const dl = p.deadline ? daysUntil(p.deadline) : null;
                  const belowStop = p.stop && price != null && price <= p.stop;
                  const belowCost = price != null && price < p.avgCost;
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/analyze/${p.symbol}`} className="font-semibold hover:text-accent">{p.symbol}</Link>
                        <div className="flex gap-1 mt-1">
                          {etpKind(p.symbol) && <Chip tone="warn">{etpKind(p.symbol) === "volatility" ? "변동성 상품" : "레버리지 상품"}</Chip>}
                          {belowStop && <Chip tone="bad">손절가 이탈</Chip>}
                          {!belowStop && belowCost && <Chip tone="warn">평단 아래</Chip>}
                          {q && !isQuote(q) && <Chip tone="bad">시세 오류</Chip>}
                        </div>
                      </td>
                      <td className="text-right num">
                        {p.shares}주<div className="text-xs text-muted">평단 {money(p.avgCost, cur)}</div>
                      </td>
                      <td className="text-right num">
                        {money(price, cur)}
                        {isQuote(q) && <div className={`text-xs ${toneOf(q.changePct)}`}>{pct(q.changePct)}</div>}
                      </td>
                      <td className={`text-right num ${toneOf(pl)}`}>
                        {signedMoney(pl, cur)}
                        <div className="text-xs">{pl != null ? pct((pl / cost) * 100) : ""}</div>
                      </td>
                      <td className="text-right num">
                        {p.target ? (
                          <>
                            <span className={toneOf(tgtPl)}>{signedMoney(tgtPl, cur)}</span>
                            <div className="text-xs text-muted">
                              {money(p.target, cur)} · {toTarget != null ? `${pct(toTarget, 1)} 남음` : ""}
                            </div>
                          </>
                        ) : (
                          <span className="text-muted text-xs">미설정</span>
                        )}
                      </td>
                      <td className="text-right num">
                        {p.stop ? (
                          <>
                            <span className={toneOf(stopPl)}>{signedMoney(stopPl, cur)}</span>
                            <div className="text-xs text-muted">{money(p.stop, cur)}</div>
                          </>
                        ) : (
                          <Chip tone="bad">미설정</Chip>
                        )}
                      </td>
                      <td className="text-xs">
                        {dl == null ? (
                          <span className="text-muted">미설정</span>
                        ) : dl < 0 ? (
                          <Chip tone="bad">기한 {-dl}일 경과</Chip>
                        ) : (
                          <span className={dl <= 3 ? "text-warn" : ""}>D-{dl}</span>
                        )}
                      </td>
                      <td className={`text-right num ${weight > CONCENTRATION_LIMIT ? "text-bad font-semibold" : ""}`}>
                        {weight.toFixed(1)}%
                      </td>
                      <td className="text-right">
                        <button className="text-xs text-accent mr-2" onClick={() => setEditing(p)}>편집</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {app.positions.some((p) => p.thesis || p.invalidation) && (
        <Section title="진입 근거 · 철회 조건">
          <div className="grid gap-3 md:grid-cols-2">
            {app.positions
              .filter((p) => p.thesis || p.invalidation)
              .map((p) => (
                <div key={p.id} className="rounded-lg border border-line p-3 text-sm">
                  <div className="font-semibold">{p.symbol}</div>
                  {p.thesis && <p className="mt-1"><span className="text-muted">근거 · </span>{p.thesis}</p>}
                  {p.invalidation && <p className="mt-1"><span className="text-bad">철회 · </span>{p.invalidation}</p>}
                </div>
              ))}
          </div>
        </Section>
      )}

      {etps.map((s) => (
        <EtpWarning key={s} symbol={s} kind={etpKind(s)!} />
      ))}

      <SwitchCalculator positions={app.positions} quotes={quotes} cash={app.cash} />
    </div>
  );
}

function PositionForm({
  initial,
  prefill,
  onClose,
}: {
  initial?: Position;
  prefill?: { symbol: string; avgCost?: number };
  onClose: () => void;
}) {
  const [f, setF] = useState({
    symbol: initial?.symbol ?? prefill?.symbol ?? "",
    shares: initial?.shares?.toString() ?? "",
    avgCost: initial?.avgCost?.toString() ?? prefill?.avgCost?.toString() ?? "",
    target: initial?.target?.toString() ?? "",
    stop: initial?.stop?.toString() ?? "",
    deadline: initial?.deadline ?? "",
    thesis: initial?.thesis ?? "",
    invalidation: initial?.invalidation ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  const optNum = (s: string) => (s.trim() === "" ? undefined : Number(s) > 0 ? Number(s) : undefined);

  const valid = f.symbol.trim() && Number(f.shares) > 0 && Number(f.avgCost) > 0;
  const shares = Number(f.shares) || 0;
  const cost = Number(f.avgCost) || 0;
  const tgt = optNum(f.target);
  const stp = optNum(f.stop);

  const save = () => {
    if (!valid) return;
    const pos: Position = {
      id: initial?.id ?? uid(),
      symbol: f.symbol.trim().toUpperCase(),
      shares,
      avgCost: cost,
      target: tgt,
      stop: stp,
      deadline: f.deadline || undefined,
      thesis: f.thesis.trim() || undefined,
      invalidation: f.invalidation.trim() || undefined,
    };
    setData((d) => ({
      ...d,
      positions: initial ? d.positions.map((p) => (p.id === initial.id ? pos : p)) : [...d.positions, pos],
    }));
    onClose();
  };

  const remove = () => {
    if (!initial || !confirm(`${initial.symbol} 포지션을 삭제할까요?`)) return;
    setData((d) => ({ ...d, positions: d.positions.filter((p) => p.id !== initial.id) }));
    onClose();
  };

  return (
    <Section title={initial ? `${initial.symbol} 편집` : "새 포지션"} right={<button className="text-sm text-muted" onClick={onClose}>닫기</button>}>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="종목 *"><input value={f.symbol} onChange={set("symbol")} placeholder="SVIX" className="uppercase" /></Field>
        <Field label="수량 *"><input type="number" min={0} step="any" value={f.shares} onChange={set("shares")} /></Field>
        <Field label="평균 매수가 *"><input type="number" min={0} step="0.01" value={f.avgCost} onChange={set("avgCost")} /></Field>
        <Field label="목표 매도가"><input type="number" min={0} step="0.01" value={f.target} onChange={set("target")} /></Field>
        <Field label="손절가"><input type="number" min={0} step="0.01" value={f.stop} onChange={set("stop")} /></Field>
        <Field label="보유 기한"><input type="date" value={f.deadline} onChange={set("deadline")} /></Field>
      </div>
      {shares > 0 && cost > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm mt-3 num text-muted">
          <span>원금 {money(shares * cost)}</span>
          {tgt && (
            <span>
              목표 도달 시 <span className={toneOf(tgt - cost)}>{signedMoney((tgt - cost) * shares)} ({pct(((tgt - cost) / cost) * 100)})</span>
            </span>
          )}
          {stp && (
            <span>
              손절 시 <span className={toneOf(stp - cost)}>{signedMoney((stp - cost) * shares)} ({pct(((stp - cost) / cost) * 100)})</span>
            </span>
          )}
          {tgt && stp && stp < cost && tgt > cost && <span>손익비 {((tgt - cost) / (cost - stp)).toFixed(2)} : 1</span>}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 mt-3">
        <Field label="진입 근거"><textarea value={f.thesis} onChange={set("thesis")} rows={2} placeholder="왜 이 가격에 샀는가" /></Field>
        <Field label="철회 조건"><textarea value={f.invalidation} onChange={set("invalidation")} rows={2} placeholder="어떤 일이 생기면 논리를 재검토하는가" /></Field>
      </div>
      {!stp && <p className="text-xs text-warn mt-2">손절 기준이 없습니다. 매수 전에 최대 손실을 정하는 것이 원칙입니다.</p>}
      <div className="flex gap-2 mt-4">
        <button className="btn btn-primary" onClick={save} disabled={!valid}>저장</button>
        <button className="btn" onClick={onClose}>취소</button>
        {initial && <button className="btn ml-auto text-bad" onClick={remove}>삭제</button>}
      </div>
    </Section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted [&>input]:text-sm [&>textarea]:text-sm [&>input]:text-text [&>textarea]:text-text">
      {label}
      {children}
    </label>
  );
}
