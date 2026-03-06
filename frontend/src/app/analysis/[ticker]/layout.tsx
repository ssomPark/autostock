import type { Metadata } from "next";

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

interface Props {
  params: Promise<{ ticker: string }>;
  children: React.ReactNode;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;

  // Try KOSPI first for 6-digit Korean tickers, else NASDAQ
  const market = /^\d{6}$/.test(ticker) ? "KOSPI" : "NASDAQ";

  let name = ticker;
  let signal = "";
  let grade = "";

  try {
    const res = await fetch(
      `${BACKEND_URL}/api/analysis/${ticker}/score?market=${market}`,
      { next: { revalidate: 3600 } }
    );
    if (res.ok) {
      const json = await res.json();
      const d = json?.data;
      if (d) {
        name = d.ticker || ticker;
        signal = d.signal || "";
        grade = d.grade || "";
      }
    }
  } catch {
    // Backend unreachable — fall back to ticker-only meta
  }

  const signalLabel =
    signal === "BUY" ? "매수" : signal === "SELL" ? "매도" : signal === "HOLD" ? "관망" : signal;

  const title = signalLabel
    ? `${name} 주식 분석 — ${signalLabel} ${grade}`
    : `${name} 주식 분석`;

  const description = signalLabel
    ? `${name} 기술적 분석 결과: ${signalLabel} 신호, ${grade} 등급. AI 매매 추천과 차트 패턴을 확인하세요.`
    : `${name} AI 기술적 분석 — 매매 신호, 차트 패턴, 지지/저항선을 확인하세요.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://traderadars.com/analysis/${ticker}`,
    },
  };
}

export default function AnalysisLayout({ children }: Props) {
  return <>{children}</>;
}
