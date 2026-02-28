"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PipelineRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin");
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-[var(--muted)]">관리자 대시보드로 이동 중...</div>
    </div>
  );
}
