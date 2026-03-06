import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "펀더멘탈 스크리닝",
  description:
    "가치·품질·성장 3차원 펀더멘탈 분석으로 저평가 우량주를 발굴합니다. PER, PBR, ROE, 성장률 기반 종합 점수 제공.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
