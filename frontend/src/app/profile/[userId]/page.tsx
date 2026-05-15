"use client";

import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchProfile, followUser, unfollowUser } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function ProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const uid = Number(userId);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", uid],
    queryFn: () => fetchProfile(uid),
    enabled: !!uid,
  });

  const followMutation = useMutation({
    mutationFn: (isFollowing: boolean) => isFollowing ? unfollowUser(uid) : followUser(uid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", uid] });
    },
  });

  if (isLoading) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-20 w-20 rounded-full bg-[var(--card-bg)]" />
          <div className="h-6 w-48 bg-[var(--card-bg)] rounded" />
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="p-6 max-w-4xl mx-auto">
        <p className="text-[var(--text-secondary)]">사용자를 찾을 수 없습니다.</p>
      </main>
    );
  }

  const isMe = user?.id === profile.id;

  return (
    <main className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Profile Header */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6">
        <div className="flex items-center gap-4">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.name}
              className="w-16 h-16 rounded-full"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center text-2xl font-bold text-blue-400">
              {profile.name.charAt(0)}
            </div>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-bold">{profile.name}</h1>
            {profile.created_at && (
              <p className="text-sm text-[var(--text-secondary)]">
                가입일: {new Date(profile.created_at).toLocaleDateString("ko-KR")}
              </p>
            )}
          </div>
          {!isMe && user && (
            <button
              onClick={() => followMutation.mutate(!!profile.is_following)}
              disabled={followMutation.isPending}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                profile.is_following
                  ? "bg-[var(--card-bg)] border border-[var(--card-border)] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                  : "bg-blue-500 text-white hover:bg-blue-600"
              }`}
            >
              {profile.is_following ? "팔로잉" : "팔로우"}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-6 mt-4 text-sm">
          <div>
            <span className="font-bold">{profile.follower_count}</span>{" "}
            <span className="text-[var(--text-secondary)]">팔로워</span>
          </div>
          <div>
            <span className="font-bold">{profile.following_count}</span>{" "}
            <span className="text-[var(--text-secondary)]">팔로잉</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold">{profile.follower_count}</p>
            <p className="text-sm text-[var(--text-secondary)]">팔로워</p>
          </div>
          <div>
            <p className="text-2xl font-bold">{profile.following_count}</p>
            <p className="text-sm text-[var(--text-secondary)]">팔로잉</p>
          </div>
          <div>
            <p className="text-2xl font-bold">
              {profile.created_at
                ? Math.floor((Date.now() - new Date(profile.created_at).getTime()) / (1000 * 60 * 60 * 24))
                : 0}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">활동일</p>
          </div>
        </div>
      </div>
    </main>
  );
}
