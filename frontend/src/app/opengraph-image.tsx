import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "TradeRadars - AI 주식 분석 플랫폼";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: 72,
            fontWeight: 800,
            letterSpacing: "-2px",
          }}
        >
          <span style={{ color: "#f1f5f9" }}>Trade</span>
          <span style={{ color: "#3b82f6" }}>Radars</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 28,
            color: "#94a3b8",
            fontWeight: 500,
          }}
        >
          AI 주식 분석 플랫폼
        </div>

        {/* Feature pills */}
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 48,
          }}
        >
          {[
            { icon: "📊", label: "매매 신호" },
            { icon: "📈", label: "기술적 분석" },
            { icon: "📰", label: "뉴스 감성" },
            { icon: "🔄", label: "백테스트" },
          ].map((f) => (
            <div
              key={f.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "12px 24px",
                borderRadius: 12,
                backgroundColor: "rgba(59, 130, 246, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                fontSize: 20,
                color: "#e2e8f0",
              }}
            >
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            display: "flex",
            marginTop: 48,
            fontSize: 20,
            color: "#64748b",
          }}
        >
          traderadars.com
        </div>
      </div>
    ),
    { ...size }
  );
}
