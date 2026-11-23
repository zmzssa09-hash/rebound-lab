"use client";
// 사기 전 체크리스트 — 모두 체크해야 '준비 완료'
import Link from "next/link";
import { useState } from "react";
import { money } from "@/lib/format";

export default function BuyChecklist({
  symbol,
  price,
  stop,
  t1,
  earningsDays,
  maxWeight,
}: {
  symbol: string;
  price: number;
  stop: number | null;
  t1: number | null;
  earningsDays: number | null;
  maxWeight: number;
}) {
  const items = [
    stop != null ? `종가가 손절가 ${money(stop)} 아래로 내려가면 미련 없이 판다` : "손절가를 직접 정했다 (예: 산 가격의 10% 아래)",
    `이 종목에는 전체 투자금의 ${maxWeight}% 이하만 넣는다 (위 계산기의 주식 수만큼)`,
    earningsDays != null && earningsDays <= 14
      ? `실적 발표가 ${earningsDays === 0 ? "오늘" : `${earningsDays}일 뒤`}라는 걸 안다 — 발표 날 크게 움직일 수 있다`
      : "2주 안에 실적 발표가 없다는 걸 확인했다",
    "아래 '왜 떨어졌나'를 읽고 이유를 이해했다",
    "당장 쓸 돈이 아니고, 잃어도 생활에 지장이 없다",
  ];
  const [on, setOn] = useState<boolean[]>(() => items.map(() => false));
  const done = on.every(Boolean);
  const saveHref = `/positions?add=${symbol}&price=${price.toFixed(2)}${stop != null ? `&stop=${stop.toFixed(2)}` : ""}${t1 != null ? `&target=${t1.toFixed(2)}` : ""}`;
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-sm font-semibold">
        사기 전 체크리스트{" "}
        <span className="text-xs text-muted font-normal num">
          {on.filter(Boolean).length}/{items.length}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((t, i) => (
          <li key={i}>
            <label className="flex items-start gap-2 cursor-pointer">
              <input type="checkbox" className="mt-1" checked={on[i]} onChange={() => setOn((o) => o.map((v, j) => (j === i ? !v : v)))} />
              <span className={on[i] ? "text-muted line-through" : ""}>{t}</span>
            </label>
          </li>
        ))}
      </ul>
      {done ? (
        <p className="text-sm text-good mt-3">
          ✅ 준비 완료. 계획대로 사고,{" "}
          <Link className="text-accent underline" href={saveHref}>
            보유 종목에 저장
          </Link>
          해 두세요. 손절가·목표가에 닿으면 홈에서 알려 드립니다.
        </p>
      ) : (
        <p className="text-xs text-muted mt-3">하나라도 체크가 안 되면 오늘은 사지 않는 편이 낫습니다.</p>
      )}
    </div>
  );
}
