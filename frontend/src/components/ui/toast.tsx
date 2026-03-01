"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

/* ---------- types ---------- */

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
  /** 퇴장 애니메이션 여부 */
  exiting: boolean;
}

interface ToastOptions {
  type: ToastType;
  message: string;
  /** ms 단위, 기본 3 000 */
  duration?: number;
}

type ToastFn = (options: ToastOptions) => void;

/* ---------- context ---------- */

const ToastContext = createContext<ToastFn | null>(null);

let nextId = 0;

/* ---------- icon helpers ---------- */

const icons: Record<ToastType, ReactNode> = {
  success: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  ),
  warning: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

const colorMap: Record<ToastType, string> = {
  success: "text-green-400 border-l-green-500",
  error: "text-red-400 border-l-red-500",
  warning: "text-yellow-400 border-l-yellow-500",
  info: "text-blue-400 border-l-blue-500",
};

/* ---------- single toast ---------- */

function ToastCard({
  item,
  onDismiss,
}: {
  item: ToastItem;
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      className={`
        pointer-events-auto flex items-start gap-3
        bg-[var(--card)] border border-[var(--card-border)] border-l-4
        ${colorMap[item.type]}
        rounded-xl px-4 py-3 shadow-2xl min-w-[280px] max-w-[380px]
        ${item.exiting ? "animate-toast-out" : "animate-toast-in"}
      `}
      role="alert"
    >
      <span className="mt-0.5 shrink-0">{icons[item.type]}</span>
      <p className="flex-1 text-sm text-[var(--foreground)] leading-snug">
        {item.message}
      </p>
      <button
        onClick={() => onDismiss(item.id)}
        className="shrink-0 p-0.5 rounded hover:bg-[var(--surface-active)] transition-colors text-[var(--muted)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

/* ---------- provider ---------- */

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    // 퇴장 애니메이션 트리거
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    // 애니메이션 종료 후 제거 (300ms)
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 300);
  }, []);

  const toast: ToastFn = useCallback(
    ({ type, message, duration = 3000 }) => {
      const id = ++nextId;
      setToasts((prev) => [...prev, { id, type, message, duration, exiting: false }]);
    },
    [],
  );

  // 자동 소멸 타이머
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    toasts.forEach((t) => {
      if (!t.exiting) {
        const timer = setTimeout(() => dismiss(t.id), t.duration);
        timers.push(timer);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {/* toast container - 우측 상단 fixed */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>

      {/* keyframe 애니메이션 */}
      <style jsx global>{`
        @keyframes toast-in {
          from {
            opacity: 0;
            transform: translateX(100%);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes toast-out {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(100%);
          }
        }
        .animate-toast-in {
          animation: toast-in 0.3s ease-out forwards;
        }
        .animate-toast-out {
          animation: toast-out 0.3s ease-in forwards;
        }
      `}</style>
    </ToastContext.Provider>
  );
}

/* ---------- hook ---------- */

export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}
