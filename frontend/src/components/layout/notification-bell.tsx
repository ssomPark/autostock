"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  type Notification,
} from "@/lib/api";

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  recommendation: { icon: "💡", label: "추천", color: "text-yellow-500" },
  system: { icon: "🔔", label: "시스템", color: "text-blue-400" },
  price_alert: { icon: "📈", label: "가격", color: "text-green-500" },
  paper_trading: { icon: "💰", label: "모의투자", color: "text-purple-400" },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "short", day: "numeric" });
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  // Poll unread count every 60s
  const loadUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await fetchUnreadCount();
      setUnreadCount(res.unread_count);
    } catch {
      // silent
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  // Load full notifications when panel opens
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchNotifications({ limit: 20 });
      setNotifications(res.notifications);
      setUnreadCount(res.unread_count);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadNotifications();
  }, [open, loadNotifications]);

  // Compute popup position when opening
  useEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const popupW = 320; // w-80
    const popupH = 420; // max-h

    // Default: below button, right-aligned to button
    let top = rect.bottom + 8;
    let left = rect.right - popupW;

    // Flip up if not enough space below
    if (top + popupH > window.innerHeight - 16) {
      top = rect.top - popupH - 8;
    }

    // Shift left if overflows right edge
    if (left + popupW > window.innerWidth - 16) {
      left = window.innerWidth - popupW - 16;
    }

    // Shift right if overflows left edge
    if (left < 16) {
      left = 16;
    }

    setPopupStyle({ top, left });
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current && !panelRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleClick = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // silent
      }
    }
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((x) => ({ ...x, is_read: true })));
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const handleDelete = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteNotification(id);
      const removed = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((x) => x.id !== id));
      if (removed && !removed.is_read) {
        setUnreadCount((c) => Math.max(0, c - 1));
      }
    } catch {
      // silent
    }
  };

  if (!isAuthenticated) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className="relative p-1.5 rounded-lg hover:bg-[var(--surface-active)] transition-colors text-[var(--muted)] hover:text-[var(--foreground)]"
        title="알림"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="fixed w-80 max-h-[420px] bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
          style={popupStyle}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">알림</h3>
              {unreadCount > 0 && (
                <span className="text-[10px] font-medium bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">
                  {unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                모두 읽음
              </button>
            )}
          </div>

          {/* Notifications list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex gap-2.5 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-[var(--surface-active)]" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-[var(--surface-active)] rounded w-3/4" />
                      <div className="h-2.5 bg-[var(--surface-active)] rounded w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--surface-active)] flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--muted)]">알림이 없습니다</p>
                <p className="text-xs text-[var(--muted)] mt-1 opacity-60">새로운 추천이나 알림이 여기에 표시됩니다</p>
              </div>
            ) : (
              notifications.map((n) => {
                const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
                return (
                  <div
                    key={n.id}
                    onClick={() => handleClick(n)}
                    className={`group relative px-4 py-3 border-b border-[var(--card-border)] cursor-pointer transition-colors ${
                      !n.is_read
                        ? "bg-blue-500/[0.06] hover:bg-blue-500/[0.1] border-l-2 border-l-blue-500"
                        : "hover:bg-[var(--surface-active)] border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="text-base mt-0.5 shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className={`text-[10px] font-medium ${cfg.color} opacity-80`}>{cfg.label}</span>
                          <span className="text-[10px] text-[var(--muted)] opacity-50">·</span>
                          <span className="text-[10px] text-[var(--muted)] opacity-50">{timeAgo(n.created_at)}</span>
                        </div>
                        <p className={`text-sm leading-snug ${!n.is_read ? "font-semibold text-[var(--foreground)]" : "text-[var(--foreground)]"}`}>
                          {n.title}
                        </p>
                        {n.message && (
                          <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2 leading-relaxed">{n.message}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0 mt-0.5">
                        {!n.is_read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500" />
                        )}
                        <button
                          onClick={(e) => handleDelete(n.id, e)}
                          className="p-1 rounded hover:bg-red-500/10 text-[var(--muted)] hover:text-red-400 transition-all opacity-0 group-hover:opacity-100"
                          title="삭제"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}
