import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-6xl font-bold text-blue-500 mb-4">404</p>
      <h1 className="text-xl font-semibold mb-2">페이지를 찾을 수 없습니다</h1>
      <p className="text-[var(--muted)] text-sm mb-8 max-w-md">
        요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
      </p>
      <div className="flex gap-3">
        <Link
          href="/"
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          홈으로 이동
        </Link>
        <Link
          href="/search"
          className="px-5 py-2.5 border border-[var(--card-border)] hover:bg-[var(--surface-hover)] text-sm font-medium rounded-lg transition-colors"
        >
          종목 검색
        </Link>
      </div>
    </div>
  );
}
