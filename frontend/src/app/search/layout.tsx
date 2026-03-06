import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "종목 분석",
  description:
    "AI 기반 주식 기술적 분석 - 캔들스틱 패턴, 차트 패턴, 지지/저항선, 거래량 분석으로 매매 신호와 종합 등급을 제공합니다.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
