import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "TradeRadars 이용약관 - 서비스 이용 규칙, 투자 면책 조항, 이용자 의무, 지적 재산권 안내",
};

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto py-10 px-4 space-y-10 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">이용약관</h1>
        <p className="text-[var(--muted)]">시행일: 2025년 3월 1일 | 최종 수정: 2026년 3월 31일</p>
      </header>

      <Section title="제1조 (목적)">
        <p>
          본 약관은 TradeRadars(이하 &ldquo;서비스&rdquo;)가 제공하는 주식 분석
          플랫폼의 이용과 관련하여 서비스와 이용자 간의 권리·의무 및 책임 사항을
          규정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (정의)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            &ldquo;서비스&rdquo;란 TradeRadars가 운영하는 웹사이트
            (traderadars.com)를 통해 제공하는 주식 기술적 분석, AI 매매 추천, 뉴스
            감성 분석, 펀더멘탈 스크리닝, 백테스트, 모의 투자 등 일체의 서비스를
            말합니다.
          </li>
          <li>
            &ldquo;이용자&rdquo;란 본 약관에 따라 서비스를 이용하는 모든 사람을
            말합니다.
          </li>
          <li>
            &ldquo;회원&rdquo;이란 Google OAuth를 통해 로그인한 이용자를 말합니다.
          </li>
        </ol>
      </Section>

      <Section title="제3조 (약관의 효력 및 변경)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>본 약관은 서비스 화면에 게시하거나 기타 방법으로 공지함으로써 효력이 발생합니다.</li>
          <li>
            서비스는 관련 법령을 위배하지 않는 범위에서 약관을 변경할 수 있으며,
            변경 시 적용일 7일 전부터 공지합니다.
          </li>
        </ol>
      </Section>

      <Section title="제4조 (서비스의 제공)">
        <p>서비스는 다음 기능을 제공합니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>한국·미국 주식 기술적 분석 (캔들스틱 패턴, 차트 패턴, 지지/저항선, 거래량 분석)</li>
          <li>AI 기반 매수/매도/관망 추천 및 종합 점수 산출</li>
          <li>뉴스 감성 분석 및 관련 종목 매핑</li>
          <li>펀더멘탈 스크리닝 및 종목 비교</li>
          <li>백테스트 시뮬레이션</li>
          <li>모의 투자 (가상 자금 거래 연습)</li>
          <li>포트폴리오 분석 및 리스크 평가</li>
          <li>경제 이벤트 캘린더 및 수혜 종목 분석</li>
          <li>커뮤니티 게시판</li>
        </ul>
      </Section>

      <Section title="제5조 (회원 가입 및 탈퇴)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>회원 가입은 Google OAuth 인증을 통해 이루어집니다.</li>
          <li>비회원도 일부 기능(종목 분석 일 5회, 투자 추천 조회, 뉴스 열람)을 이용할 수 있습니다.</li>
          <li>
            회원은 언제든지 탈퇴를 요청할 수 있으며, 서비스는 즉시 탈퇴를 처리하고
            관련 법령에 따라 개인정보를 파기합니다.
          </li>
        </ol>
      </Section>

      <Section title="제6조 (이용자의 의무)">
        <p>이용자는 다음 행위를 하여서는 안 됩니다.</p>
        <ol className="list-decimal pl-5 space-y-1 mt-2">
          <li>타인의 개인정보를 도용하거나 허위 정보를 등록하는 행위</li>
          <li>서비스의 정상적인 운영을 방해하는 행위 (해킹, 크롤링, DDoS 등)</li>
          <li>다른 이용자에게 불쾌감을 주는 내용을 게시하는 행위</li>
          <li>서비스에서 제공하는 정보를 상업적으로 무단 이용하는 행위</li>
          <li>관련 법령에 위반되는 행위</li>
        </ol>
      </Section>

      <Section title="제7조 (서비스의 중단)">
        <p>
          서비스는 다음 사유가 발생한 경우 서비스 제공을 일시 중단할 수 있으며,
          가능한 한 사전에 공지합니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>시스템 정기 점검, 교체, 고장</li>
          <li>천재지변, 국가 비상사태 등 불가항력적 사유</li>
          <li>외부 데이터 소스(한국투자증권 API, yfinance 등)의 장애</li>
        </ul>
      </Section>

      <Section title="제8조 (지적 재산권)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>
            서비스가 작성한 분석 결과, UI 디자인, 로고 등 지적 재산권은 서비스에
            귀속됩니다.
          </li>
          <li>
            이용자가 게시한 게시글·댓글의 저작권은 해당 이용자에게 귀속되며,
            서비스는 서비스 운영 목적 범위 내에서 이를 이용할 수 있습니다.
          </li>
        </ol>
      </Section>

      {/* ── 투자 면책 조항 ── */}
      <section className="space-y-3 p-5 rounded-xl border-2 border-amber-500/30 bg-amber-500/5">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <span className="text-amber-400">&#9888;</span>
          제9조 (투자 면책 조항)
        </h2>
        <div className="text-[var(--muted)] space-y-3">
          <p className="font-semibold text-[var(--foreground)]">
            본 서비스에서 제공하는 모든 정보는 투자 권유가 아니며, 투자 판단의 최종
            책임은 이용자 본인에게 있습니다.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              서비스가 제공하는 기술적 분석, AI 매매 추천, 종합 점수, 뉴스 감성
              분석 등은 <strong>참고 자료</strong>로만 활용되어야 하며, 특정 종목의
              매수·매도를 권유하거나 투자 수익을 보장하지 않습니다.
            </li>
            <li>
              과거의 분석 결과나 추천 적중률이 미래 수익을 보장하지 않습니다. 주식
              투자에는 <strong>원금 손실의 위험</strong>이 있습니다.
            </li>
            <li>
              모의 투자 기능의 수익률은 가상 환경에서의 결과이며, 실제 시장에서
              동일한 수익률을 달성할 수 있음을 의미하지 않습니다.
            </li>
            <li>
              서비스는 데이터의 정확성, 완전성, 적시성을 보장하지 않으며, 외부
              데이터 소스의 오류로 인한 손실에 대해 책임지지 않습니다.
            </li>
            <li>
              이용자는 본인의 재무 상황, 투자 목표, 위험 허용 수준을 고려하여
              독립적인 투자 판단을 하여야 하며, 필요시 공인된 금융 전문가의 자문을
              구해야 합니다.
            </li>
          </ol>
        </div>
      </section>

      <Section title="제10조 (손해 배상)">
        <p>
          서비스는 무료로 제공되며, 서비스 이용으로 발생하는 어떠한 직접적·간접적
          손해에 대해서도 법률상 허용되는 최대 한도 내에서 책임을 지지 않습니다.
          다만, 서비스의 고의 또는 중대한 과실로 인한 손해는 예외로 합니다.
        </p>
      </Section>

      <Section title="제11조 (분쟁 해결)">
        <ol className="list-decimal pl-5 space-y-1">
          <li>서비스와 이용자 간 분쟁이 발생한 경우, 양측은 원만한 해결을 위해 성실히 협의합니다.</li>
          <li>본 약관에 명시되지 않은 사항은 대한민국 관련 법령에 따릅니다.</li>
        </ol>
      </Section>

      <Section title="제12조 (기타)">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            본 약관에 대한 문의는 <strong>traderadars@gmail.com</strong>으로 연락
            주시기 바랍니다.
          </li>
        </ul>
      </Section>
    </article>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="text-[var(--muted)] space-y-2">{children}</div>
    </section>
  );
}
