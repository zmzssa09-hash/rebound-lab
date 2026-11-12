"use client";
import { useRef } from "react";
import { EMPTY, normalize, setData, useAppData } from "@/lib/store";
import { SAMPLE_DATA } from "@/lib/strategy";

export default function DataTools() {
  const app = useAppData();
  const file = useRef<HTMLInputElement>(null);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(app, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rebound-lab-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (f: File) => {
    try {
      const data = normalize(JSON.parse(await f.text()));
      if (!confirm(`포지션 ${data.positions.length}개, 관심 종목 ${data.watchlist.length}개를 불러옵니다. 현재 데이터를 덮어쓸까요?`)) return;
      setData(() => data);
    } catch {
      alert("올바른 백업 파일이 아닙니다.");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button className="btn" onClick={exportJson}>백업 내보내기</button>
      <button className="btn" onClick={() => file.current?.click()}>백업 불러오기</button>
      <input
        ref={file}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = "";
        }}
      />
      <LoadSampleButton />
      <button
        className="btn text-bad"
        onClick={() => confirm("모든 포지션·관심 종목·메모를 삭제할까요? 되돌릴 수 없습니다.") && setData(() => EMPTY)}
      >
        전체 초기화
      </button>
    </div>
  );
}

export function LoadSampleButton({ primary }: { primary?: boolean }) {
  const app = useAppData();
  return (
    <button
      className={`btn ${primary ? "btn-primary" : ""}`}
      onClick={() => {
        const hasData = app.positions.length > 0 || app.watchlist.length > 0;
        if (hasData && !confirm("예시 데이터(SVIX 포지션, VCYT·FFIV·PYPL 관심 종목)로 현재 데이터를 덮어쓸까요?")) return;
        setData(() => structuredClone(SAMPLE_DATA));
      }}
    >
      예시 데이터 불러오기
    </button>
  );
}
