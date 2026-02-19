"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/search", label: "종목 분석", icon: "🔍" },
  { href: "/my-analyses", label: "분석 기록", icon: "📋", authOnly: true },
  { href: "/recommendations", label: "투자 추천", icon: "💡" },
  { href: "/paper-trading", label: "모의 투자", icon: "💰", authOnly: true },
  { href: "/news", label: "뉴스", icon: "📰" },
  { href: "/pipeline", label: "파이프라인", icon: "⚙️" },
];

function UserSection() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <div className="p-4 border-t border-[var(--card-border)]">
        <Link
          href="/auth/login"
          className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          로그인
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 border-t border-[var(--card-border)]">
      <div className="flex items-center gap-2">
        {user?.avatar_url ? (
          <img
            src={user.avatar_url}
            alt=""
            className="w-7 h-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">
            {user?.name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name}</p>
        </div>
        <button
          onClick={() => logout()}
          className="text-[var(--muted)] hover:text-red-400 transition-colors"
          title="로그아웃"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { isAuthenticated } = useAuth();
  const visibleNav = navItems.filter((item) => !item.authOnly || isAuthenticated);

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[var(--card)] border-b border-[var(--card-border)]">
        <div>
          <h1 className="text-lg font-bold">TradeRadar</h1>
          <p className="text-xs text-[var(--muted)]">AI Stock Analysis</p>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          aria-label="메뉴 열기"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile overlay menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-64 bg-[var(--card)] border-r border-[var(--card-border)] flex flex-col animate-in slide-in-from-left duration-200">
            <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
              <div>
                <h1 className="text-lg font-bold">TradeRadar</h1>
                <p className="text-xs text-[var(--muted)]">AI Stock Analysis</p>
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                aria-label="메뉴 닫기"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 p-2">
              {visibleNav.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                      active
                        ? "bg-blue-600/20 text-blue-400"
                        : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]"
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
            <UserSection />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 bg-[var(--card)] border-r border-[var(--card-border)] flex-col">
        <div className="p-4 border-b border-[var(--card-border)]">
          <h1 className="text-lg font-bold">TradeRadar</h1>
          <p className="text-xs text-[var(--muted)]">AI Stock Analysis</p>
        </div>
        <nav className="flex-1 p-2">
          {visibleNav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-sm transition-colors ${
                  active
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]"
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <UserSection />
      </aside>
    </>
  );
}
