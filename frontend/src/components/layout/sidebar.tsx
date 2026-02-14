"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "대시보드", icon: "📊" },
  { href: "/recommendations", label: "투자 추천", icon: "💡" },
  { href: "/news", label: "뉴스", icon: "📰" },
  { href: "/pipeline", label: "파이프라인", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 bg-[var(--card)] border-r border-[var(--card-border)] flex flex-col">
      <div className="p-4 border-b border-[var(--card-border)]">
        <h1 className="text-lg font-bold">AutoStock</h1>
        <p className="text-xs text-[var(--muted)]">AI Stock Analysis</p>
      </div>
      <nav className="flex-1 p-2">
        {navItems.map((item) => {
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
      <div className="p-4 border-t border-[var(--card-border)] text-xs text-[var(--muted)]">
        v0.1.0
      </div>
    </aside>
  );
}
