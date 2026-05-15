import type { Metadata } from "next";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const defaultTitle = `${ticker} - TradeRadar`;
  const defaultDesc = `${ticker} 종목 분석 - 기술적 분석, 펀더멘탈, 뉴스, 이벤트`;
  // 티커 형식으로 마켓 자동 감지
  const market = /^\d{6}$/.test(ticker) ? "KOSPI" : "NASDAQ";

  try {
    const res = await fetch(`${BACKEND_URL}/api/analysis/${ticker}/score?market=${market}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return {
        title: defaultTitle,
        description: defaultDesc,
      };
    }
    const json = await res.json();
    const sc = json.data;
    const name = sc?.name || sc?.stock_info?.name || ticker;
    const signal = sc?.signal || "HOLD";
    const grade = sc?.grade || "-";
    const confidenceVal = typeof sc?.confidence === "object" ? sc.confidence?.final : sc?.confidence;
    const confidence = confidenceVal ? `${Number(confidenceVal).toFixed(0)}%` : "-";

    const signalKo = signal === "BUY" ? "매수" : signal === "SELL" ? "매도" : "관망";

    return {
      title: `${name} (${ticker}) ${signalKo} - TradeRadar`,
      description: `${name} ${signalKo} 신호 | 등급 ${grade} | 신뢰도 ${confidence} — TradeRadar 종합 분석`,
      openGraph: {
        title: `${name} (${ticker}) ${signalKo} - TradeRadar`,
        description: `${name} ${signalKo} 신호 | 등급 ${grade} | 신뢰도 ${confidence}`,
        type: "website",
        siteName: "TradeRadar",
      },
      twitter: {
        card: "summary_large_image",
        title: `${name} (${ticker}) ${signalKo}`,
        description: `등급 ${grade} | 신뢰도 ${confidence}`,
      },
    };
  } catch {
    return {
      title: defaultTitle,
      description: defaultDesc,
    };
  }
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
