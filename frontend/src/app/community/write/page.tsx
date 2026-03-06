"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  createCommunityPost,
  updateCommunityPost,
  fetchCommunityPost,
} from "@/lib/api";

const CATEGORIES = [
  { key: "discussion", label: "자유" },
  { key: "question", label: "질문" },
  { key: "tips", label: "팁" },
  { key: "proof", label: "인증" },
];

function WriteForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("discussion");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingPost, setLoadingPost] = useState(false);

  // Load existing post for edit mode
  useEffect(() => {
    if (editId) {
      setLoadingPost(true);
      fetchCommunityPost(Number(editId))
        .then((post) => {
          setTitle(post.title);
          setContent(post.content);
          setCategory(post.category);
        })
        .catch(() => {
          setError("게시글을 불러올 수 없습니다.");
        })
        .finally(() => setLoadingPost(false));
    }
  }, [editId]);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [authLoading, isAuthenticated, router]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) {
      setError("제목과 내용을 입력해주세요.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      if (editId) {
        await updateCommunityPost(Number(editId), {
          title: title.trim(),
          content: content.trim(),
          category,
        });
        router.push(`/community/${editId}`);
      } else {
        const post = await createCommunityPost({
          title: title.trim(),
          content: content.trim(),
          category,
        });
        router.push(`/community/${post.id}`);
      }
    } catch (err: any) {
      if (err?.status === 401) {
        setError("로그인이 필요합니다.");
      } else if (err?.status === 403) {
        setError("수정 권한이 없습니다.");
      } else {
        setError("저장에 실패했습니다. 다시 시도해주세요.");
      }
      setSubmitting(false);
    }
  };

  if (authLoading || loadingPost) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="animate-pulse bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
          <div className="h-8 bg-[var(--surface-hover)] rounded w-1/2 mb-4" />
          <div className="h-40 bg-[var(--surface-hover)] rounded w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        href="/community"
        className="inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        목록으로
      </Link>

      <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 space-y-5">
        <h1 className="text-xl font-bold">
          {editId ? "글 수정" : "새 글 작성"}
        </h1>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {/* Category */}
        <div>
          <label className="block text-sm font-medium mb-2">카테고리</label>
          <div className="flex gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  category === cat.key
                    ? "bg-blue-600/20 text-blue-400 font-medium"
                    : "bg-[var(--surface-hover)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-2">제목</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            maxLength={300}
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium mb-2">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="내용을 입력하세요"
            rows={12}
            className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Link
            href="/community"
            className="px-4 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          >
            취소
          </Link>
          <button
            onClick={handleSubmit}
            disabled={submitting || !title.trim() || !content.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {submitting
              ? "저장 중..."
              : editId
                ? "수정"
                : "등록"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CommunityWritePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto">
          <div className="animate-pulse bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
            <div className="h-8 bg-[var(--surface-hover)] rounded w-1/2 mb-4" />
            <div className="h-40 bg-[var(--surface-hover)] rounded w-full" />
          </div>
        </div>
      }
    >
      <WriteForm />
    </Suspense>
  );
}
