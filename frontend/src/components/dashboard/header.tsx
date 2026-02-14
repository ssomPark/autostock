export function DashboardHeader() {
  const now = new Date();
  const timeStr = now.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <div>
      <h1 className="text-2xl font-bold">대시보드</h1>
      <p className="text-sm text-[var(--muted)]">{timeStr}</p>
    </div>
  );
}
