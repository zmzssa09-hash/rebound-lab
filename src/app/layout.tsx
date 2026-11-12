import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import MarketStatusBanner from "@/components/MarketStatusBanner";
import Nav from "@/components/Nav";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "리바운드 랩 — 과매도 반등 + 펀더멘털 분석",
  description: "RSI 과매도 종목을 추세·MACD·거래량·지지선과 펀더멘털로 함께 검증하는 투자 분석 도구",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Suspense fallback={<div className="h-14 border-b border-line" />}>
          <Nav />
        </Suspense>
        <MarketStatusBanner />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-6">{children}</main>
        <footer className="border-t border-line mt-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 text-xs text-muted leading-relaxed">
            리바운드 랩은 투자 판단을 돕는 분석 도구이며 투자 권유가 아닙니다. 시세는 야후 파이낸스의 비공식 데이터로 지연되거나
            틀릴 수 있습니다. 주문 전에는 증권사 호가와 회사 공시를 반드시 다시 확인하세요. 입력한 포지션·관심종목은 이
            브라우저에만 저장됩니다.
          </div>
        </footer>
      </body>
    </html>
  );
}
