import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "게시판",
  description:
    "투자 정보 공유 커뮤니티. 종목 분석, 매매 전략, 시장 전망을 다른 투자자들과 나눠보세요.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
