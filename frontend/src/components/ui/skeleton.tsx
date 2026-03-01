"use client";

/* ---------- 기본 블록 ---------- */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-[var(--surface-hover)] rounded-lg ${className}`} />;
}

/* ---------- SkeletonText ---------- */

interface SkeletonTextProps {
  /** 줄 수, 기본 3 */
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className = "" }: SkeletonTextProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBlock
          key={i}
          className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/* ---------- SkeletonCard ---------- */

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className = "" }: SkeletonCardProps) {
  return (
    <div
      className={`bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5 space-y-4 ${className}`}
    >
      {/* 제목 영역 */}
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-3 w-1/2" />
        </div>
      </div>
      {/* 본문 영역 */}
      <SkeletonText lines={3} />
    </div>
  );
}

/* ---------- SkeletonTable ---------- */

interface SkeletonTableProps {
  /** 행 수, 기본 5 */
  rows?: number;
  /** 열 수, 기본 4 */
  cols?: number;
  className?: string;
}

export function SkeletonTable({
  rows = 5,
  cols = 4,
  className = "",
}: SkeletonTableProps) {
  return (
    <div
      className={`bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden ${className}`}
    >
      {/* 헤더 행 */}
      <div className="flex gap-4 px-4 py-3 border-b border-[var(--card-border)]">
        {Array.from({ length: cols }).map((_, c) => (
          <SkeletonBlock
            key={`h-${c}`}
            className={`h-3 flex-1 ${c === 0 ? "max-w-[120px]" : ""}`}
          />
        ))}
      </div>

      {/* 데이터 행 */}
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={`r-${r}`}
          className="flex gap-4 px-4 py-3 border-b border-[var(--card-border)] last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, c) => (
            <SkeletonBlock
              key={`r-${r}-c-${c}`}
              className={`h-3 flex-1 ${c === 0 ? "max-w-[120px]" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
