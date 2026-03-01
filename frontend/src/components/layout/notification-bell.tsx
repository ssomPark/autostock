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

const TYPE_ICONS: Record<string, string> = {
  recommendation: "💡",
  system: "🔔",
  price_alert: "📈",
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
  return new Date(dateStr).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
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
          className="fixed w-80 max-h-[420px] bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl z-50 flex flex-col overflow-hidden"
          style={popupStyle}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
            <h3 className="text-sm font-semibold">알림</h3>
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
              <div className="p-6 text-center text-[var(--muted)] text-sm">로딩 중...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm text-[var(--muted)]">알림이 없습니다</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`px-4 py-3 border-b border-[var(--card-border)] cursor-pointer hover:bg-white/[0.03] transition-colors ${
                    !n.is_read ? "bg-blue-600/5" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-base mt-0.5 shrink-0">
                      {TYPE_ICONS[n.type] || "🔔"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm truncate ${!n.is_read ? "font-semibold" : ""}`}>
                          {n.title}
                        </p>
                        <button
                          onClick={(e) => handleDelete(n.id, e)}
                          className="shrink-0 p-0.5 rounded hover:bg-[var(--surface-active)] text-[var(--muted)] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                          style={{ opacity: 1 }}
                          title="삭제"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                      {n.message && (
                        <p className="text-xs text-[var(--muted)] mt-0.5 line-clamp-2">{n.message}</p>
                      )}
                      <p className="text-[10px] text-[var(--muted)] mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
