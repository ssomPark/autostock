import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "뉴스 분석",
  description:
    "실시간 주식 뉴스 감성 분석. 긍정/부정/중립 분류와 관련 종목 매핑으로 시장 흐름을 파악하세요.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
