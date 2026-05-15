"use client";

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/lib/auth-context";

// 크롤러가 이 페이지를 인덱싱하지 않도록 metadata는 layout에서 처리

function CallbackInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { setToken } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    const token = searchParams.get("token");
    if (token) {
      processed.current = true;
      setToken(token).then(() => router.replace("/"));
    } else {
      router.replace("/auth/login");
    }
  }, [searchParams, setToken, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[var(--muted)]">로그인 처리 중...</p>
    </div>
  );
}

export default function CallbackPage() {
  return (
    <Suspense>
      <CallbackInner />
    </Suspense>
  );
}
