"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchCommunityPosts, CommunityPost } from "@/lib/api";

const CATEGORIES = [
  { key: "", label: "전체" },
  { key: "discussion", label: "자유" },
  { key: "question", label: "질문" },
  { key: "tips", label: "팁" },
  { key: "proof", label: "인증" },
];

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  discussion: { label: "자유", color: "bg-blue-500/20 text-blue-400" },
  question: { label: "질문", color: "bg-amber-500/20 text-amber-400" },
  tips: { label: "팁", color: "bg-emerald-500/20 text-emerald-400" },
  proof: { label: "인증", color: "bg-purple-500/20 text-purple-400" },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(dateStr).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function CommunityPage() {
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState("");
  const [sortBy, setSortBy] = useState("created_at");
  const [page, setPage] = useState(1);
  const size = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["community-posts", category, sortBy, page],
    queryFn: () =>
      fetchCommunityPosts({
        page,
        size,
        category: category || undefined,
        sort_by: sortBy,
      }),
  });

  const posts = data?.posts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / size));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">게시판</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            자유롭게 의견을 나눠보세요
          </p>
        </div>
        {isAuthenticated ? (
          <Link
            href="/community/write"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            글쓰기
          </Link>
        ) : (
          <Link
            href="/auth/login"
            className="px-4 py-2 bg-[var(--surface-hover)] text-[var(--muted)] rounded-lg text-sm"
          >
            로그인 후 글쓰기
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => {
              setCategory(cat.key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              category === cat.key
                ? "bg-blue-600/20 text-blue-400 font-medium"
                : "bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {cat.label}
          </button>
        ))}
        <div className="ml-auto">
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value);
              setPage(1);
            }}
            className="text-sm bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg px-3 py-1.5 text-[var(--foreground)]"
          >
            <option value="created_at">최신순</option>
            <option value="view_count">조회순</option>
          </select>
        </div>
      </div>

      {/* Post list */}
      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-[var(--card-border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-[var(--surface-hover)] rounded w-3/4 mb-2" />
                <div className="h-3 bg-[var(--surface-hover)] rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="p-12 text-center text-[var(--muted)]">
            <svg
              className="mx-auto mb-3 w-12 h-12 opacity-30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="text-sm">아직 게시글이 없습니다.</p>
            {isAuthenticated && (
              <Link
                href="/community/write"
                className="inline-block mt-3 text-sm text-blue-400 hover:underline"
              >
                첫 글을 작성해보세요
              </Link>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {posts.map((post) => (
              <PostRow key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--surface-hover)] disabled:opacity-40 hover:bg-[var(--surface-active)] transition-colors"
          >
            이전
          </button>
          <span className="text-sm text-[var(--muted)]">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-3 py-1.5 rounded-lg text-sm bg-[var(--surface-hover)] disabled:opacity-40 hover:bg-[var(--surface-active)] transition-colors"
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

function PostRow({ post }: { post: CommunityPost }) {
  const badge = CATEGORY_BADGE[post.category];
  return (
    <Link
      href={`/community/${post.id}`}
      className="block p-4 hover:bg-[var(--surface-hover)] transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Author avatar */}
        <div className="flex-shrink-0 mt-0.5">
          {post.author_avatar ? (
            <img
              src={post.author_avatar}
              alt=""
              className="w-8 h-8 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400">
              {post.author_name?.[0]?.toUpperCase() || "?"}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {post.is_pinned && (
              <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-medium">
                고정
              </span>
            )}
            {badge && (
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-medium ${badge.color}`}
              >
                {badge.label}
              </span>
            )}
            <h3 className="text-sm font-medium truncate">{post.title}</h3>
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
            <span>{post.author_name || "익명"}</span>
            <span>{timeAgo(post.created_at)}</span>
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              {post.view_count}
            </span>
            <span className="flex items-center gap-1">
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {post.comment_count}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
