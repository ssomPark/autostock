"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchNews } from "@/lib/api";

export function RecentNews() {
  const { data, isLoading } = useQuery({
    queryKey: ["news", 5],
    queryFn: () => fetchNews(5),
  });

  return (
    <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg">
      <div className="p-4 border-b border-[var(--card-border)]">
        <h2 className="font-semibold">최근 뉴스</h2>
      </div>
      <div className="p-4 space-y-3">
        {isLoading && <p className="text-[var(--muted)]">로딩 중...</p>}
        {!isLoading && (!data?.data || data.data.length === 0) && (
          <p className="text-[var(--muted)] text-sm">수집된 뉴스가 없습니다.</p>
        )}
        {data?.data?.map((article: any, i: number) => (
          <a
            key={i}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block text-sm hover:text-[var(--accent)] transition-colors"
          >
            <p className="line-clamp-2">{article.title}</p>
            <p className="text-xs text-[var(--muted)] mt-1">{article.source}</p>
          </a>
        ))}
      </div>
    </div>
  );
}
