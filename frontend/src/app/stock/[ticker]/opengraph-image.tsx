import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TradeRadar 종목 분석";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || "http://localhost:8000";

const signalConfig: Record<string, { bg: string; text: string; label: string }> = {
  BUY: { bg: "rgba(34,197,94,0.25)", text: "#4ade80", label: "매수" },
  SELL: { bg: "rgba(239,68,68,0.25)", text: "#f87171", label: "매도" },
  HOLD: { bg: "rgba(234,179,8,0.25)", text: "#facc15", label: "관망" },
};

export default async function Image({ params }: { params: { ticker: string } }) {
  const { ticker } = params;

  let name = ticker;
  let signal = "HOLD";
  let grade = "-";
  let confidence = 0;
  let totalScore = 0;

  // 티커 형식으로 마켓 자동 감지: 숫자 6자리 = 한국, 그 외 = 미국
  const market = /^\d{6}$/.test(ticker) ? "KOSPI" : "NASDAQ";

  try {
    const res = await fetch(`${BACKEND_URL}/api/analysis/${ticker}/score?market=${market}`, {
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const json = await res.json();
      const sc = json.data;
      name = sc?.stock_info?.name || ticker;
      signal = sc?.signal || "HOLD";
      grade = sc?.grade || "-";
      // confidence: API가 객체({final: N}) 또는 숫자를 반환 — 표시용 퍼센트로 정규화
      const rawConf = typeof sc?.confidence === "object" ? sc.confidence?.final : sc?.confidence;
      confidence = rawConf != null ? Number(rawConf) : 0;
      totalScore = sc?.total_score || 0;
    }
  } catch {
    // use defaults
  }

  const sc = signalConfig[signal] || signalConfig.HOLD;
  const scorePct = Math.min(Math.max(totalScore * 10, 0), 100);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "sans-serif",
          padding: 60,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", marginBottom: 20 }}>
          <span style={{ fontSize: 24, color: "#64748b", fontWeight: 500 }}>TradeRadars</span>
        </div>

        {/* Stock name + ticker */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontSize: 56, fontWeight: 800, color: "#f1f5f9" }}>{name}</span>
          <span style={{ fontSize: 32, color: "#94a3b8", fontWeight: 500 }}>{ticker}</span>
        </div>

        {/* Signal badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            marginTop: 40,
          }}
        >
          <div
            style={{
              display: "flex",
              padding: "16px 40px",
              borderRadius: 16,
              backgroundColor: sc.bg,
              border: `2px solid ${sc.text}`,
              fontSize: 36,
              fontWeight: 800,
              color: sc.text,
            }}
          >
            {sc.label}
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "12px 32px",
              borderRadius: 12,
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            <span style={{ fontSize: 14, color: "#94a3b8" }}>등급</span>
            <span style={{ fontSize: 36, fontWeight: 800, color: "#60a5fa" }}>{grade}</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "12px 32px",
              borderRadius: 12,
              backgroundColor: "rgba(59, 130, 246, 0.15)",
              border: "1px solid rgba(59, 130, 246, 0.3)",
            }}
          >
            <span style={{ fontSize: 14, color: "#94a3b8" }}>신뢰도</span>
            <span style={{ fontSize: 36, fontWeight: 800, color: "#e2e8f0" }}>
              {confidence > 1 ? confidence.toFixed(0) : (confidence * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Score bar */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "80%",
            marginTop: 40,
            gap: 8,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: "#94a3b8" }}>
            <span>종합 점수</span>
            <span>{totalScore.toFixed(1)} / 10</span>
          </div>
          <div
            style={{
              display: "flex",
              width: "100%",
              height: 16,
              borderRadius: 8,
              backgroundColor: "rgba(255,255,255,0.1)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${scorePct}%`,
                height: "100%",
                borderRadius: 8,
                background: `linear-gradient(90deg, ${sc.text}, #3b82f6)`,
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", marginTop: 40, fontSize: 18, color: "#475569" }}>
          traderadars.com
        </div>
      </div>
    ),
    { ...size },
  );
}
