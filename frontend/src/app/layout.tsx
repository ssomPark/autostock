import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { QueryProvider } from "@/lib/query-provider";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-provider";

const SITE_URL = "https://traderadars.com";
const SITE_NAME = "TradeRadars";
const SITE_DESC =
  "AI 기반 한국·미국 주식 분석 플랫폼. 기술적 분석, 매매 신호, 뉴스 감성 분석, 펀더멘탈 스크리닝, 백테스트까지 무료로 제공합니다.";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} - AI 주식 분석`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESC,
  metadataBase: new URL(SITE_URL),
  keywords: [
    "주식 분석",
    "AI 주식",
    "기술적 분석",
    "매매 신호",
    "한국 주식",
    "미국 주식",
    "종목 추천",
    "뉴스 감성 분석",
    "펀더멘탈 분석",
    "백테스트",
    "모의 투자",
    "stock analysis",
    "trading signals",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} - AI 주식 분석`,
    description: SITE_DESC,
    url: SITE_URL,
    locale: "ko_KR",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - AI 주식 분석`,
    description: SITE_DESC,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: SITE_URL,
  },
  verification: {
    google: "aOk6-0EZwuQXY1AQLlnaTvL2oOCt4Bb4ZWANChEEKLo",
  },
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||(t==='system'&&window.matchMedia('(prefers-color-scheme: light)').matches)){document.documentElement.classList.add('light')}}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>
              <div className="flex flex-col lg:flex-row h-screen">
                <Sidebar />
                <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
              </div>
            </ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
