"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <p className="text-5xl mb-4">⚠️</p>
      <h1 className="text-xl font-semibold mb-2">문제가 발생했습니다</h1>
      <p className="text-[var(--muted)] text-sm mb-8 max-w-md">
        일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
      >
        다시 시도
      </button>
    </div>
  );
}
