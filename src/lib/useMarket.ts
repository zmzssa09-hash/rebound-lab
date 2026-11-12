"use client";
import { useEffect, useState } from "react";
import type { Tone } from "./types";

export interface MarketItem {
  symbol: string;
  label: string;
  price: number;
  chg1d: number | null;
  chg1w: number | null;
  chg1m: number | null;
  chg3m: number | null;
  rsi: number | null;
  above50: boolean | null;
  above200: boolean | null;
  spark: number[];
}

export interface MarketData {
  indices: MarketItem[];
  sectors: MarketItem[];
  vixRatio: number | null;
  breadth: { stocks: number; above50: number; above200: number; oversold: number; overbought: number; scannedAt: number } | null;
  regime: { title: string; tone: Tone; points: string[]; strategy: string };
  fetchedAt: number;
}

export function useMarket() {
  const [data, setData] = useState<MarketData | null>(null);
  useEffect(() => {
    fetch("/api/market")
      .then((r) => r.json())
      .then((j) => !j.error && setData(j))
      .catch(() => {});
  }, []);
  return data;
}
