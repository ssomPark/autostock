import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "투자 추천",
  description:
    "AI가 분석한 한국·미국 주식 매수/매도/관망 추천 목록. 종합 점수, 신뢰도, 목표가를 확인하세요.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
