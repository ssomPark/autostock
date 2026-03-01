"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-provider";
import { NotificationBell } from "@/components/layout/notification-bell";
import { fetchNavOrder } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  authOnly?: boolean;
  adminOnly?: boolean;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/search", label: "종목 분석", icon: "🔍" },
  { href: "/my-analyses", label: "분석 기록", icon: "📋", authOnly: true },
  { href: "/recommendations", label: "투자 추천", icon: "💡" },
  { href: "/events", label: "이벤트 캘린더", icon: "📅", authOnly: true },
  { href: "/paper-trading", label: "모의 투자", icon: "💰", authOnly: true },
  { href: "/portfolio", label: "포트폴리오", icon: "📑", authOnly: true },
  { href: "/news", label: "뉴스", icon: "📰" },
  { href: "/compare", label: "종목 비교", icon: "⚖️", authOnly: true },
  { href: "/admin", label: "관리자", icon: "🛡️", adminOnly: true },
];

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="p-2 rounded-lg hover:bg-[var(--surface-hover)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
      title={resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
    >
      {resolvedTheme === "dark" ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}

function UserSection() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return (
      <div className="p-4 border-t border-[var(--card-border)] flex items-center justify-between">
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
        <ThemeToggle />
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
        <ThemeToggle />
        <NotificationBell />
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
  const [navItems, setNavItems] = useState<NavItem[]>(DEFAULT_NAV_ITEMS);
  const { isAuthenticated, user } = useAuth();

  // 서버에서 메뉴 순서 로딩
  useEffect(() => {
    fetchNavOrder()
      .then((res) => {
        if (res.order && res.order.length > 0) {
          const itemMap = new Map(DEFAULT_NAV_ITEMS.map((item) => [item.href, item]));
          const sorted: NavItem[] = [];
          for (const href of res.order) {
            const item = itemMap.get(href);
            if (item) {
              sorted.push(item);
              itemMap.delete(href);
            }
          }
          // 서버에 없는 항목은 뒤에 추가
          for (const item of itemMap.values()) {
            sorted.push(item);
          }
          setNavItems(sorted);
        }
      })
      .catch(() => {
        // fallback: 기본 순서 유지
      });
  }, []);

  const visibleNav = navItems
    .filter((item) => {
      if (item.adminOnly) return user?.is_admin;
      if (item.authOnly) return isAuthenticated;
      return true;
    })
    .map((item) =>
      item.href === "/" && !isAuthenticated
        ? { ...item, label: "홈" }
        : item
    );

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-[var(--card)] border-b border-[var(--card-border)]">
        <div>
          <h1 className="text-lg font-bold">TradeRadar</h1>
          <p className="text-xs text-[var(--muted)]">AI Stock Analysis</p>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
          <button
            onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg hover:bg-[var(--surface-active)] transition-colors"
          aria-label="메뉴 열기"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        </div>
      </div>

      {/* Mobile overlay menu */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-[var(--overlay)]"
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
                className="p-2 rounded-lg hover:bg-[var(--surface-active)] transition-colors"
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
                        : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
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
                    : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
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
