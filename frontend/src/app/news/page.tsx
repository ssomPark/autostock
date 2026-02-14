"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchNews } from "@/lib/api";

export default function NewsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: () => fetchNews(),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">경제/테크 뉴스</h1>
      {isLoading ? (
        <div className="text-[var(--muted)]">로딩 중...</div>
      ) : (
        <div className="space-y-3">
          {data?.data?.length === 0 && (
            <p className="text-[var(--muted)]">수집된 뉴스가 없습니다.</p>
          )}
          {data?.data?.map((article: any, i: number) => (
            <div
              key={i}
              className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors"
            >
              <a href={article.url} target="_blank" rel="noopener noreferrer">
                <h3 className="font-medium mb-1 hover:text-[var(--accent)]">
                  {article.title}
                </h3>
              </a>
              <p className="text-sm text-[var(--muted)] mb-2">{article.summary}</p>
              <div className="flex gap-3 text-xs text-[var(--muted)]">
                <span>{article.source}</span>
                {article.published_at && <span>{article.published_at}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
