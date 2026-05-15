import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "개인정보 처리방침",
  description:
    "TradeRadars 개인정보 처리방침 - 수집하는 개인정보 항목, 이용 목적, 보유 기간, 제3자 제공, 쿠키 정책 안내",
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto py-10 px-4 space-y-10 text-sm leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">개인정보 처리방침</h1>
        <p className="text-[var(--muted)]">시행일: 2025년 3월 1일 | 최종 수정: 2026년 3월 31일</p>
      </header>

      <p>
        TradeRadars(이하 &ldquo;서비스&rdquo;)는 이용자의 개인정보를 중요시하며,
        「개인정보 보호법」 및 관련 법령을 준수합니다. 본 방침은 서비스가 어떤
        개인정보를 수집하고, 어떻게 이용·보관·파기하는지 안내합니다.
      </p>

      <Section title="1. 수집하는 개인정보 항목 및 수집 방법">
        <h4 className="font-semibold mt-3 mb-1">가. Google OAuth 로그인 시</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>이름, 이메일 주소, 프로필 사진 URL</li>
          <li>수집 방법: Google OAuth 2.0 인증 시 자동 수집</li>
        </ul>
        <h4 className="font-semibold mt-3 mb-1">나. 서비스 이용 과정에서 자동 생성</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>접속 IP 주소, 브라우저 유형, 접속 일시</li>
          <li>분석 요청 기록, 모의 투자 거래 내역</li>
          <li>게시글·댓글 작성 기록</li>
          <li>쿠키 및 유사 기술을 통한 이용 통계</li>
        </ul>
      </Section>

      <Section title="2. 개인정보의 이용 목적">
        <ul className="list-disc pl-5 space-y-1">
          <li>회원 식별 및 서비스 제공 (분석 결과 저장, 모의 투자, 게시판 이용 등)</li>
          <li>서비스 개선 및 통계 분석</li>
          <li>부정 이용 방지 및 서비스 안정성 확보</li>
          <li>법적 의무 이행 및 분쟁 해결</li>
        </ul>
      </Section>

      <Section title="3. 개인정보의 보유 및 이용 기간">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>회원 정보:</strong> 회원 탈퇴 요청 시까지 보유하며, 탈퇴 후 지체
            없이 파기합니다.
          </li>
          <li>
            <strong>접속 로그:</strong> 통신비밀보호법에 따라 3개월 보관 후 파기합니다.
          </li>
          <li>
            <strong>게시글·댓글:</strong> 작성자가 삭제하거나 탈퇴 요청 시 삭제합니다.
          </li>
        </ul>
      </Section>

      <Section title="4. 개인정보의 제3자 제공">
        <p>
          서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만
          다음의 경우에는 예외로 합니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>이용자가 사전에 동의한 경우</li>
          <li>법률에 특별한 규정이 있거나 법령상 의무를 준수하기 위해 불가피한 경우</li>
        </ul>
      </Section>

      <Section title="5. 쿠키(Cookie) 및 추적 기술">
        <p>
          서비스는 이용자 경험을 개선하고 이용 통계를 수집하기 위해 쿠키를 사용합니다.
        </p>
        <h4 className="font-semibold mt-3 mb-1">가. Google Analytics</h4>
        <p>
          서비스 이용 패턴 분석을 위해 Google Analytics를 사용합니다. 수집된 데이터는
          익명화 처리되며, Google의 개인정보 처리방침에 따라 관리됩니다.
        </p>
        <h4 className="font-semibold mt-3 mb-1">나. Google AdSense</h4>
        <p>
          광고 제공을 위해 Google AdSense를 사용하며, Google은 쿠키를 통해 이용자의
          관심사에 기반한 광고를 표시할 수 있습니다. 이용자는 Google 광고 설정
          페이지에서 맞춤 광고를 비활성화할 수 있습니다.
        </p>
        <h4 className="font-semibold mt-3 mb-1">다. 쿠키 거부 방법</h4>
        <p>
          웹 브라우저 설정에서 쿠키를 거부할 수 있습니다. 다만 쿠키를 거부하면 로그인
          유지 등 일부 기능이 정상 작동하지 않을 수 있습니다.
        </p>
      </Section>

      <Section title="6. 개인정보의 파기 절차 및 방법">
        <p>
          서비스는 개인정보 보유 기간 경과 또는 처리 목적 달성 시, 해당 개인정보를
          지체 없이 파기합니다.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>전자적 파일: 복구·재생이 불가능한 방법으로 삭제</li>
          <li>출력물: 분쇄하거나 소각하여 파기</li>
        </ul>
      </Section>

      <Section title="7. 이용자의 권리와 행사 방법">
        <p>이용자(또는 법정 대리인)는 언제든지 다음 권리를 행사할 수 있습니다.</p>
        <ul className="list-disc pl-5 space-y-1 mt-2">
          <li>개인정보 열람 요청</li>
          <li>오류 정정 요청</li>
          <li>삭제 요청</li>
          <li>처리 정지 요청</li>
        </ul>
        <p className="mt-2">
          위 권리 행사는 서비스 내 설정 또는 이메일(traderadars@gmail.com)을 통해
          가능하며, 지체 없이 조치하겠습니다.
        </p>
      </Section>

      <Section title="8. 개인정보의 안전성 확보 조치">
        <ul className="list-disc pl-5 space-y-1">
          <li>비밀번호를 직접 저장하지 않습니다 (Google OAuth만 사용).</li>
          <li>HTTPS를 통한 데이터 암호화 전송</li>
          <li>접근 권한 최소화 및 관리자 인증 체계 운영</li>
          <li>정기적인 보안 점검 및 취약점 개선</li>
        </ul>
      </Section>

      <Section title="9. 개인정보 보호 책임자">
        <ul className="list-none space-y-1">
          <li><strong>서비스명:</strong> TradeRadars</li>
          <li><strong>이메일:</strong> traderadars@gmail.com</li>
        </ul>
        <p className="mt-2">
          개인정보 침해에 대한 신고나 상담이 필요한 경우, 개인정보침해신고센터
          (privacy.kisa.or.kr, 국번 없이 118)에 문의하실 수 있습니다.
        </p>
      </Section>

      <Section title="10. 방침 변경 안내">
        <p>
          본 개인정보 처리방침은 관련 법령 또는 서비스 정책 변경에 따라 수정될 수
          있으며, 변경 시 서비스 공지사항을 통해 안내합니다.
        </p>
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
