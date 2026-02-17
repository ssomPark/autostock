"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchNews } from "@/lib/api";

type SentimentFilter = "all" | "positive" | "negative";

const SENTIMENT_CONFIG = {
  positive: { label: "호재", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" },
  negative: { label: "악재", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30" },
  neutral: { label: "중립", color: "text-[var(--muted)]", bg: "bg-white/5 border-white/10" },
} as const;

export default function NewsPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<SentimentFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: () => fetchNews(),
  });

  const articles: any[] = data?.data ?? [];
  const filtered = filter === "all"
    ? articles
    : articles.filter((a: any) => a.sentiment === filter);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">경제/테크 뉴스</h1>
        <div className="flex gap-1 rounded-lg bg-[var(--card)] border border-[var(--card-border)] p-1">
          {([
            { key: "all", label: "전체" },
            { key: "positive", label: "호재" },
            { key: "negative", label: "악재" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                filter === key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
              {key !== "all" && (
                <span className="ml-1 opacity-60">
                  {articles.filter((a: any) => a.sentiment === key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-[var(--muted)]">로딩 중...</div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 && (
            <p className="text-[var(--muted)]">
              {filter === "all" ? "수집된 뉴스가 없습니다." : "해당 조건의 뉴스가 없습니다."}
            </p>
          )}
          {filtered.map((article: any, i: number) => {
            const cfg = SENTIMENT_CONFIG[article.sentiment as keyof typeof SENTIMENT_CONFIG] ?? SENTIMENT_CONFIG.neutral;
            return (
              <div
                key={i}
                className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors"
              >
                <div className="flex items-start gap-2 mb-1">
                  <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0">
                    <h3 className="font-medium hover:text-[var(--accent)] transition-colors">
                      {article.title}
                    </h3>
                  </a>
                  {article.sentiment !== "neutral" && (
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  )}
                </div>

                {article.summary && (
                  <p className="text-sm text-[var(--muted)] mb-2">{article.summary}</p>
                )}

                {article.related_stocks?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {article.related_stocks.map((stock: any) => (
                      <button
                        key={stock.ticker}
                        onClick={() => router.push(`/search?q=${stock.ticker}`)}
                        className="text-xs px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 hover:bg-[var(--accent)]/20 transition-colors"
                      >
                        {stock.name}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 text-xs text-[var(--muted)]">
                  <span>{article.source}</span>
                  {article.published_at && <span>{article.published_at}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
