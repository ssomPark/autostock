import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "백테스트",
  description:
    "AI 매매 신호 기반 과거 매매 시뮬레이션. 수익률, 최대낙폭, 샤프비율, 승률로 전략 성과를 검증하세요.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
