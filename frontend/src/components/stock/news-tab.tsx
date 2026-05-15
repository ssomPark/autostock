"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchNewsByTicker } from "@/lib/api";

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

export function NewsTab({ ticker, stockName }: { ticker: string; stockName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["stock-news", ticker],
    queryFn: () => fetchNewsByTicker(stockName || ticker, 30),
  });

  const articles = data?.data ?? [];

  if (isLoading) {
    return <div className="text-center py-12 text-[var(--muted)]">뉴스를 불러오는 중...</div>;
  }

  if (articles.length === 0) {
    return (
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-8 text-center text-[var(--muted)]">
        <p>{stockName} 관련 뉴스가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {articles.map((article: { title: string; url: string; source: string; published_at: string; summary?: string }, i: number) => (
        <a
          key={i}
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4 hover:border-blue-500/30 transition-colors"
        >
          <h3 className="text-sm font-medium mb-1 line-clamp-2">{article.title}</h3>
          {article.summary && (
            <p className="text-xs text-[var(--muted)] line-clamp-2 mb-2">{article.summary}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{article.source}</span>
            <span>{timeAgo(article.published_at)}</span>
          </div>
        </a>
      ))}
    </div>
  );
}
