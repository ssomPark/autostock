import Link from "next/link";

const legalLinks = [
  { href: "/about", label: "소개" },
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/terms", label: "이용약관" },
];

export function Footer() {
  return (
    <footer className="border-t border-[var(--card-border)] bg-[var(--card)] mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 투자 면책 고지 */}
        <p className="text-[10px] text-[var(--muted)] leading-relaxed text-center max-w-2xl mx-auto">
          TradeRadars에서 제공하는 모든 정보(기술적 분석, AI 매매 추천, 뉴스 감성 분석 등)는
          투자 권유가 아니며 참고 자료로만 활용되어야 합니다. 투자 판단의 최종 책임은
          이용자 본인에게 있으며, 주식 투자에는 원금 손실의 위험이 있습니다.
        </p>

        {/* 링크 + 저작권 */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <nav className="flex items-center gap-4">
            {legalLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <a
              href="mailto:traderadars@gmail.com"
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              문의
            </a>
          </nav>
          <p className="text-[10px] text-[var(--muted)]">
            &copy; {new Date().getFullYear()} TradeRadars. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
