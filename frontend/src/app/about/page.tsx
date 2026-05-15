import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "소개",
  description:
    "TradeRadars는 AI 기술과 정량적 분석을 결합하여 개인 투자자에게 데이터 기반 인사이트를 무료로 제공하는 주식 분석 플랫폼입니다.",
};

const analysisFeatures = [
  {
    icon: "📊",
    title: "기술적 분석",
    desc: "캔들스틱 패턴(도지, 해머, 엔걸핑 등), 차트 패턴(이중 천장/바닥, 플래그, 삼각형), 지지/저항선, 거래량 분석을 자동으로 수행합니다. RSI, EMA, ATR, 피보나치 되돌림 등 핵심 지표를 종합하여 A+부터 F까지 등급을 산출합니다.",
  },
  {
    icon: "🤖",
    title: "AI 매매 추천",
    desc: "뉴스 감성(20%), 캔들스틱(20%), 차트 패턴(25%), 지지/저항(20%), 거래량(15%)의 5가지 신호를 가중 합산하여 매수(BUY), 매도(SELL), 관망(HOLD)을 판정합니다. 각 신호의 근거와 신뢰도를 함께 제공하여 투자자가 직접 판단할 수 있도록 돕습니다.",
  },
  {
    icon: "📰",
    title: "뉴스 감성 분석",
    desc: "네이버 뉴스를 실시간으로 수집하고, 자연어 처리를 통해 호재·악재·중립을 분류합니다. 뉴스에 언급된 종목을 자동 매핑하여 특정 종목에 어떤 뉴스가 영향을 미치는지 한눈에 파악할 수 있습니다.",
  },
  {
    icon: "📈",
    title: "펀더멘탈 스크리닝",
    desc: "PER, PBR, ROE, 부채비율, 매출 성장률 등 핵심 재무 지표를 가치·성장·품질·밸런스 카테고리로 분류하여 종합 점수를 산출합니다. 수치만 나열하는 것이 아니라, 각 지표의 의미와 해석 기준을 함께 안내합니다.",
  },
  {
    icon: "🔄",
    title: "백테스트",
    desc: "과거 주가 데이터를 기반으로 매매 전략의 성과를 시뮬레이션합니다. 수익률, 최대 낙폭(MDD), 승률 등 핵심 지표를 통해 전략의 유효성을 검증할 수 있습니다.",
  },
  {
    icon: "💰",
    title: "모의 투자",
    desc: "가상 자금 1억 원으로 실제 시장 데이터에 기반한 매매를 연습합니다. 포지션 관리, 수익률 추적, 거래 이력 조회를 통해 실전 감각을 익힐 수 있습니다.",
  },
  {
    icon: "📑",
    title: "포트폴리오 분석",
    desc: "보유 종목을 등록하면 AI가 종합 리포트를 생성합니다. 섹터 분산, 리스크 지표, 개별 종목 진단까지 포트폴리오 전반을 점검할 수 있습니다.",
  },
  {
    icon: "📅",
    title: "경제 이벤트 캘린더",
    desc: "FOMC 회의, 고용 지표 발표, 실적 시즌 등 주요 경제 이벤트를 캘린더로 관리하고, 각 이벤트가 영향을 미칠 수 있는 수혜 종목까지 연결하여 보여줍니다.",
  },
];

export default function AboutPage() {
  return (
    <article className="max-w-4xl mx-auto py-10 px-4 space-y-14 text-sm leading-relaxed">
      {/* Hero */}
      <header className="text-center space-y-4">
        <h1 className="text-3xl font-bold">
          Trade<span className="text-blue-500">Radars</span> 소개
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-2xl mx-auto">
          AI 기술과 정량적 분석을 결합하여 개인 투자자에게
          <br className="hidden sm:block" />
          데이터 기반 투자 인사이트를 무료로 제공하는 플랫폼입니다.
        </p>
      </header>

      {/* 서비스 철학 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">왜 TradeRadars를 만들었나요?</h2>
        <div className="text-[var(--muted)] space-y-3">
          <p>
            주식 투자에서 객관적인 데이터 분석은 필수적이지만, 개인 투자자가 직접 기술적 분석을
            수행하고 다양한 지표를 종합적으로 해석하기란 쉽지 않습니다. 전문 투자 도구는
            대부분 유료이거나 사용법이 복잡하여 접근성이 낮습니다.
          </p>
          <p>
            TradeRadars는 이러한 문제를 해결하기 위해 만들어졌습니다. 복잡한 기술적 분석을
            자동화하고, AI가 여러 신호를 종합하여 이해하기 쉬운 형태로 제공합니다.
            누구나 무료로 사용할 수 있으며, 분석의 근거를 투명하게 공개하여 투자자가
            스스로 판단할 수 있도록 돕는 것이 핵심 가치입니다.
          </p>
        </div>
      </section>

      {/* 분석 방법론 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">분석 방법론</h2>
        <p className="text-[var(--muted)]">
          TradeRadars는 5가지 독립적인 분석 신호를 가중 합산하여 종합 판정을 내립니다.
          각 신호의 비중은 광범위한 백테스트를 통해 최적화되었습니다.
        </p>
        <div className="grid grid-cols-5 gap-2 mt-4">
          {[
            { label: "뉴스 감성", weight: "20%", color: "bg-blue-500" },
            { label: "캔들스틱", weight: "20%", color: "bg-green-500" },
            { label: "차트 패턴", weight: "25%", color: "bg-purple-500" },
            { label: "지지/저항", weight: "20%", color: "bg-amber-500" },
            { label: "거래량", weight: "15%", color: "bg-red-500" },
          ].map((s) => (
            <div key={s.label} className="text-center space-y-1">
              <div className={`h-2 rounded-full ${s.color} opacity-70`} />
              <p className="text-xs font-medium">{s.weight}</p>
              <p className="text-[10px] text-[var(--muted)]">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 기능 소개 */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">주요 기능 상세 안내</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {analysisFeatures.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-5 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{f.icon}</span>
                <h3 className="font-semibold">{f.title}</h3>
              </div>
              <p className="text-[var(--muted)] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 데이터 출처 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">데이터 출처</h2>
        <div className="text-[var(--muted)] space-y-2">
          <p>TradeRadars는 신뢰할 수 있는 데이터 소스를 활용합니다.</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>한국 주식:</strong> 한국투자증권 Open API를 통한 실시간·일봉 시세 데이터</li>
            <li><strong>미국 주식:</strong> Yahoo Finance를 통한 글로벌 주가 데이터</li>
            <li><strong>뉴스:</strong> 네이버 뉴스 API를 통한 국내 경제·증권 뉴스</li>
            <li><strong>펀더멘탈:</strong> 공시 기반 재무제표 및 기업 정보</li>
          </ul>
          <p className="text-xs mt-2">
            데이터는 외부 소스에서 수집되며, 수집 시점에 따라 지연이 발생할 수
            있습니다. TradeRadars는 데이터의 정확성을 보장하지 않으며, 투자 판단의
            최종 책임은 이용자에게 있습니다.
          </p>
        </div>
      </section>

      {/* 기술 스택 */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold">기술 스택</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { category: "Frontend", items: "Next.js 15, TypeScript, Tailwind CSS, TradingView Charts" },
            { category: "Backend", items: "Python, FastAPI, SQLAlchemy" },
            { category: "Database", items: "PostgreSQL, Redis" },
            { category: "AI/분석", items: "N8N 파이프라인, OpenAI, scipy, ta" },
          ].map((t) => (
            <div
              key={t.category}
              className="rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-3 space-y-1"
            >
              <p className="text-xs font-semibold text-blue-400">{t.category}</p>
              <p className="text-xs text-[var(--muted)]">{t.items}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 연락처 */}
      <section className="space-y-4 text-center">
        <h2 className="text-xl font-semibold">문의</h2>
        <p className="text-[var(--muted)]">
          서비스 관련 문의, 버그 신고, 제안 사항은 아래로 연락해 주세요.
        </p>
        <p className="font-medium">traderadars@gmail.com</p>
        <div className="flex items-center justify-center gap-4 pt-2">
          <Link
            href="/privacy"
            className="text-xs text-blue-400 hover:underline"
          >
            개인정보 처리방침
          </Link>
          <span className="text-[var(--card-border)]">|</span>
          <Link
            href="/terms"
            className="text-xs text-blue-400 hover:underline"
          >
            이용약관
          </Link>
        </div>
      </section>
    </article>
  );
}
