"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchCommunityPost,
  fetchCommunityComments,
  createCommunityComment,
  deleteCommunityPost,
  deleteCommunityComment,
  CommunityComment,
} from "@/lib/api";

const CATEGORY_BADGE: Record<string, { label: string; color: string }> = {
  discussion: { label: "자유", color: "bg-blue-500/20 text-blue-400" },
  question: { label: "질문", color: "bg-amber-500/20 text-amber-400" },
  tips: { label: "팁", color: "bg-emerald-500/20 text-emerald-400" },
  proof: { label: "인증", color: "bg-purple-500/20 text-purple-400" },
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CommunityPostPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const postId = Number(params.id);

  const [commentText, setCommentText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const { data: post, isLoading: postLoading } = useQuery({
    queryKey: ["community-post", postId],
    queryFn: () => fetchCommunityPost(postId),
    enabled: !!postId,
  });

  const { data: commentsData } = useQuery({
    queryKey: ["community-comments", postId],
    queryFn: () => fetchCommunityComments(postId),
    enabled: !!postId,
  });

  const comments = commentsData?.comments ?? [];

  const addComment = useMutation({
    mutationFn: (content: string) => createCommunityComment(postId, content),
    onSuccess: () => {
      setCommentText("");
      queryClient.invalidateQueries({ queryKey: ["community-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["community-post", postId] });
    },
  });

  const removeComment = useMutation({
    mutationFn: (commentId: number) => deleteCommunityComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["community-post", postId] });
    },
  });

  const handleDeletePost = async () => {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      await deleteCommunityPost(postId);
      router.push("/community");
    } catch {
      alert("삭제에 실패했습니다.");
      setDeleting(false);
    }
  };

  const isAuthor = user && post && user.id === post.user_id;
  const badge = post ? CATEGORY_BADGE[post.category] : null;

  if (postLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="animate-pulse bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
          <div className="h-6 bg-[var(--surface-hover)] rounded w-2/3 mb-4" />
          <div className="h-4 bg-[var(--surface-hover)] rounded w-full mb-2" />
          <div className="h-4 bg-[var(--surface-hover)] rounded w-3/4" />
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="max-w-3xl mx-auto text-center py-20">
        <p className="text-[var(--muted)]">게시글을 찾을 수 없습니다.</p>
        <Link href="/community" className="text-sm text-blue-400 hover:underline mt-2 inline-block">
          목록으로
        </Link>
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

      {/* Post */}
      <article className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.color}`}>
              {badge.label}
            </span>
          )}
          {post.is_pinned && (
            <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded font-medium">
              고정
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold mb-4">{post.title}</h1>

        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[var(--card-border)]">
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
          <div className="flex-1">
            <p className="text-sm font-medium">{post.author_name || "익명"}</p>
            <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
              <span>{formatDate(post.created_at)}</span>
              <span>조회 {post.view_count}</span>
            </div>
          </div>
          {isAuthor && (
            <div className="flex items-center gap-2">
              <Link
                href={`/community/write?edit=${post.id}`}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                수정
              </Link>
              <button
                onClick={handleDeletePost}
                disabled={deleting}
                className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          )}
        </div>

        <div className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</div>
      </article>

      {/* Comments */}
      <section className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6">
        <h2 className="text-sm font-bold mb-4">
          댓글 {post.comment_count > 0 && <span className="text-blue-400 ml-1">{post.comment_count}</span>}
        </h2>

        {/* Comment form */}
        {isAuthenticated ? (
          <div className="mb-6">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="댓글을 입력하세요"
              rows={3}
              className="w-full bg-[var(--background)] border border-[var(--card-border)] rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={() => {
                  if (commentText.trim()) addComment.mutate(commentText.trim());
                }}
                disabled={!commentText.trim() || addComment.isPending}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {addComment.isPending ? "등록 중..." : "댓글 등록"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)] mb-6">
            <Link href="/auth/login" className="text-blue-400 hover:underline">
              로그인
            </Link>
            하면 댓글을 작성할 수 있습니다.
          </p>
        )}

        {/* Comment list */}
        {comments.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-4">아직 댓글이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            {comments.map((c) => (
              <CommentItem
                key={c.id}
                comment={c}
                isOwner={!!user && user.id === c.user_id}
                onDelete={() => {
                  if (confirm("댓글을 삭제하시겠습니까?")) removeComment.mutate(c.id);
                }}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function CommentItem({
  comment,
  isOwner,
  onDelete,
}: {
  comment: CommunityComment;
  isOwner: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex gap-3">
      {comment.author_avatar ? (
        <img
          src={comment.author_avatar}
          alt=""
          className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="w-7 h-7 rounded-full bg-blue-600/30 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0 mt-0.5">
          {comment.author_name?.[0]?.toUpperCase() || "?"}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">{comment.author_name || "익명"}</span>
          <span className="text-xs text-[var(--muted)]">
            {comment.created_at
              ? new Date(comment.created_at).toLocaleString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : ""}
          </span>
          {isOwner && (
            <button
              onClick={onDelete}
              className="text-xs text-red-400 hover:text-red-300 transition-colors ml-auto"
            >
              삭제
            </button>
          )}
        </div>
        <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
      </div>
    </div>
  );
}
