"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { fetchNews } from "@/lib/api";
import { AdUnit } from "@/components/ads/ad-unit";

type SentimentFilter = "all" | "positive" | "negative";
type DateRange = "today" | "week" | "month" | "all";

const SENTIMENT_CONFIG = {
  positive: { label: "호재", color: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" },
  negative: { label: "악재", color: "text-red-400", bg: "bg-red-500/15 border-red-500/30" },
  neutral: { label: "중립", color: "text-[var(--muted)]", bg: "bg-[var(--surface-hover)] border-white/10" },
} as const;

const DATE_RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "today", label: "오늘" },
  { key: "week", label: "1주" },
  { key: "month", label: "1개월" },
];

const PAGE_SIZE = 20;

/** published_at 문자열에서 Date 객체를 파싱 */
function parsePublishedDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

/** 날짜 범위 필터 기준일 계산 */
function getDateRangeCutoff(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  switch (range) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start;
    }
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "month": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
    default:
      return null;
  }
}

export default function NewsPage() {
  const router = useRouter();
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());

  // 최대 100개까지 한 번에 가져오고 클라이언트에서 필터링/페이지네이션
  const { data, isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: () => fetchNews(100),
  });

  const articles: any[] = data?.data ?? [];

  // 클라이언트 사이드 필터링 (감성 + 날짜 범위 + 키워드 검색)
  const filtered = useMemo(() => {
    const cutoff = getDateRangeCutoff(dateRange);
    const query = searchQuery.trim().toLowerCase();

    return articles.filter((a: any) => {
      // 감성 필터
      if (sentimentFilter !== "all" && a.sentiment !== sentimentFilter) return false;

      // 날짜 범위 필터
      if (cutoff) {
        const pubDate = parsePublishedDate(a.published_at);
        if (!pubDate || pubDate < cutoff) return false;
      }

      // 키워드 검색 (제목 + 요약 + 관련종목 이름/티커)
      if (query) {
        const title = (a.title || "").toLowerCase();
        const summary = (a.summary || "").toLowerCase();
        const stockNames = (a.related_stocks || [])
          .map((s: any) => `${s.name || ""} ${s.ticker || ""}`.toLowerCase())
          .join(" ");
        if (!title.includes(query) && !summary.includes(query) && !stockNames.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [articles, sentimentFilter, dateRange, searchQuery]);

  // 필터 변경 시 visibleCount 리셋
  const resetVisible = useCallback(() => {
    setVisibleCount(PAGE_SIZE);
  }, []);

  // 현재 보여줄 기사
  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // 요약 토글
  const toggleExpand = useCallback((index: number) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // 감성별 카운트 (전체 기사 기준, 날짜+검색 필터 반영)
  const filteredForCounts = useMemo(() => {
    const cutoff = getDateRangeCutoff(dateRange);
    const query = searchQuery.trim().toLowerCase();
    return articles.filter((a: any) => {
      if (cutoff) {
        const pubDate = parsePublishedDate(a.published_at);
        if (!pubDate || pubDate < cutoff) return false;
      }
      if (query) {
        const title = (a.title || "").toLowerCase();
        const summary = (a.summary || "").toLowerCase();
        const stockNames = (a.related_stocks || [])
          .map((s: any) => `${s.name || ""} ${s.ticker || ""}`.toLowerCase())
          .join(" ");
        if (!title.includes(query) && !summary.includes(query) && !stockNames.includes(query)) return false;
      }
      return true;
    });
  }, [articles, dateRange, searchQuery]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">경제/테크 뉴스</h1>

        {/* 감성 필터 */}
        <div className="flex gap-1 rounded-lg bg-[var(--card)] border border-[var(--card-border)] p-1">
          {([
            { key: "all" as const, label: "전체" },
            { key: "positive" as const, label: "호재" },
            { key: "negative" as const, label: "악재" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setSentimentFilter(key);
                resetVisible();
              }}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                sentimentFilter === key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
              {key !== "all" && (
                <span className="ml-1 opacity-60">
                  {filteredForCounts.filter((a: any) => a.sentiment === key).length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 검색 + 날짜 필터 바 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* 키워드 검색 */}
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="키워드, 종목명으로 검색..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              resetVisible();
            }}
            className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-[var(--foreground)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery("");
                resetVisible();
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              title="검색어 초기화"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 날짜 범위 필터 */}
        <div className="flex gap-1 rounded-lg bg-[var(--card)] border border-[var(--card-border)] p-1">
          {DATE_RANGE_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                setDateRange(key);
                resetVisible();
              }}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                dateRange === key
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 카운트 */}
      {!isLoading && (
        <div className="text-sm text-[var(--muted)]">
          {filtered.length === 0
            ? "검색 결과가 없습니다."
            : `${filtered.length}건의 뉴스${visibleCount < filtered.length ? ` (${visibleCount}건 표시 중)` : ""}`}
        </div>
      )}

      {/* 뉴스 목록 */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 animate-pulse"
            >
              <div className="h-5 bg-[var(--surface-hover)] rounded w-3/4 mb-3" />
              <div className="h-3 bg-[var(--surface-hover)] rounded w-full mb-2" />
              <div className="h-3 bg-[var(--surface-hover)] rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((article: any, i: number) => {
            const cfg =
              SENTIMENT_CONFIG[article.sentiment as keyof typeof SENTIMENT_CONFIG] ??
              SENTIMENT_CONFIG.neutral;
            const isExpanded = expandedSet.has(i);
            const hasSummary = !!article.summary;

            return (
              <div key={`${article.url || ""}-${i}`}>
                {i === 5 && <AdUnit slot="news-infeed" format="fluid" className="mb-3" />}
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-4 hover:border-[var(--accent)] transition-colors">
                  {/* 제목 + 감성 태그 */}
                  <div className="flex items-start gap-2 mb-1">
                    <a
                      href={article.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0"
                    >
                      <h3 className="font-medium hover:text-[var(--accent)] transition-colors">
                        {article.title}
                      </h3>
                    </a>
                    {article.sentiment !== "neutral" && (
                      <span
                        className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}
                      >
                        {cfg.label}
                      </span>
                    )}
                  </div>

                  {/* 요약 (확장/접기) */}
                  {hasSummary && (
                    <div className="mb-2">
                      <p
                        className={`text-sm text-[var(--muted)] ${
                          !isExpanded ? "line-clamp-2" : ""
                        }`}
                      >
                        {article.summary}
                      </p>
                      {article.summary.length > 80 && (
                        <button
                          onClick={() => toggleExpand(i)}
                          className="text-xs text-[var(--accent)] hover:underline mt-0.5 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <>
                              접기
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </>
                          ) : (
                            <>
                              더 보기
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* 관련 종목 -> /analysis/{ticker}?market=XX */}
                  {article.related_stocks?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {article.related_stocks.map((stock: any) => (
                        <button
                          key={stock.ticker}
                          onClick={() =>
                            router.push(
                              `/analysis/${stock.ticker}?market=${stock.market || "KR"}`
                            )
                          }
                          className="text-xs px-2 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 hover:bg-[var(--accent)]/20 transition-colors"
                          title={`${stock.name} (${stock.ticker}) 분석 보기`}
                        >
                          {stock.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 출처 + 날짜 */}
                  <div className="flex gap-3 text-xs text-[var(--muted)]">
                    <span>{article.source}</span>
                    {article.published_at && (
                      <span>{article.published_at}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* 더 보기 버튼 */}
          {hasMore && (
            <button
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="w-full py-3 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)] transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              더 보기 ({filtered.length - visibleCount}건 남음)
            </button>
          )}

          {/* 뉴스 없음 */}
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <svg
                className="w-12 h-12 mx-auto mb-3 text-[var(--muted)] opacity-50"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z"
                />
              </svg>
              <p className="text-[var(--muted)]">
                {searchQuery || sentimentFilter !== "all" || dateRange !== "all"
                  ? "해당 조건의 뉴스가 없습니다."
                  : "수집된 뉴스가 없습니다."}
              </p>
              {(searchQuery || sentimentFilter !== "all" || dateRange !== "all") && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSentimentFilter("all");
                    setDateRange("all");
                    resetVisible();
                  }}
                  className="mt-2 text-sm text-[var(--accent)] hover:underline"
                >
                  필터 초기화
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
