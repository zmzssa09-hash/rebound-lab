import type { Metadata } from "next";
import { Suspense } from "react";
import Analyzer from "./Analyzer";

export async function generateMetadata({ params }: PageProps<"/analyze/[symbol]">): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `${decodeURIComponent(symbol).toUpperCase()} 분석 — 리바운드 랩` };
}

export default function Page({ params }: PageProps<"/analyze/[symbol]">) {
  return (
    <Suspense fallback={<div className="card h-96 animate-pulse" />}>
      <Resolved params={params} />
    </Suspense>
  );
}

async function Resolved({ params }: { params: PageProps<"/analyze/[symbol]">["params"] }) {
  const { symbol } = await params;
  return <Analyzer symbol={decodeURIComponent(symbol).toUpperCase()} />;
}
