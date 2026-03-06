"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  fetchReportLimit,
  searchStocks,
  type Portfolio,
  type PortfolioHolding,
  type PortfolioReport,
  type StockSearchResult,
} from "@/lib/api";
import {
  getStorageMode,
  setStorageMode,
  isLocalMode,
  getPortfolios,
  createPortfolioAdapter,
  deletePortfolioAdapter,
  getHoldings,
  addHoldingAdapter,
  deleteHoldingAdapter,
  generateReportAdapter,
  fetchReportAdapter,
  migrateLocalToServer,
  hasLocalData,
  isLoggedIn,
  type StorageMode,
} from "@/lib/portfolio-storage";

// --- Color helpers ---

function pnlColor(value: number) {
  if (value > 0) return "text-green-400";
  if (value < 0) return "text-red-400";
  return "text-[var(--muted)]";
}

function pnlPrefix(value: number) {
  return value > 0 ? "+" : "";
}

function gradeColor(grade: string) {
  if (grade.startsWith("A")) return "bg-green-500/20 text-green-400";
  if (grade.startsWith("B")) return "bg-yellow-500/20 text-yellow-400";
  if (grade.startsWith("C")) return "bg-orange-500/20 text-orange-400";
  if (grade.startsWith("D") || grade.startsWith("F")) return "bg-red-500/20 text-red-400";
  return "bg-[var(--surface-hover)] text-[var(--muted)]";
}

function signalColor(signal: string) {
  if (signal === "BUY") return "bg-green-500/20 text-green-400";
  if (signal === "SELL") return "bg-red-500/20 text-red-400";
  return "bg-[var(--surface-hover)] text-[var(--muted)]";
}

function riskColor(level: string) {
  if (level === "low") return "bg-green-500/20 text-green-400";
  if (level === "medium") return "bg-yellow-500/20 text-yellow-400";
  if (level === "high") return "bg-orange-500/20 text-orange-400";
  return "bg-red-500/20 text-red-400";
}

function riskLabel(level: string) {
  if (level === "low") return "낮음";
  if (level === "medium") return "보통";
  if (level === "high") return "높음";
  return "매우 높음";
}

// --- Donut Chart ---

const DONUT_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#a855f7",
  "#6366f1", "#e11d48", "#84cc16", "#0ea5e9", "#d946ef",
  "#10b981", "#f43f5e", "#7c3aed", "#eab308", "#64748b",
];

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return null;
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const strokeWidth = 24;
  let cumulative = 0;
  const segments = data.map((d) => {
    const pct = d.value / total;
    const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    cumulative += pct;
    const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
    const largeArc = pct > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return { ...d, pct, path: `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}` };
  });

  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {segments.map((seg, i) => (
          <path
            key={i}
            d={seg.path}
            fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeLinecap="butt"
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--foreground)" fontSize="14" fontWeight="600">
          {data.length}종목
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fill="var(--muted)" fontSize="11">
          비중
        </text>
      </svg>
      <div className="flex flex-wrap gap-2 justify-center">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1 text-xs">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-[var(--muted)]">{seg.label}</span>
            <span className="text-[var(--foreground)]">{(seg.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Grade Bar Chart ---

function GradeBarChart({ distribution }: { distribution: Record<string, number> }) {
  const entries = Object.entries(distribution).sort(([a], [b]) => a.localeCompare(b));
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const gradeBarColor: Record<string, string> = {
    "A+": "#22c55e", A: "#22c55e", "A-": "#4ade80",
    "B+": "#eab308", B: "#eab308", "B-": "#facc15",
    "C+": "#f97316", C: "#f97316", "C-": "#fb923c",
    "D+": "#ef4444", D: "#ef4444", "D-": "#f87171",
    F: "#dc2626",
  };

  return (
    <div className="flex items-end gap-2 h-28">
      {entries.map(([grade, count]) => (
        <div key={grade} className="flex flex-col items-center gap-1">
          <span className="text-xs text-[var(--muted)]">{count}</span>
          <div
            className="w-8 rounded-t-sm transition-all"
            style={{
              height: `${(count / max) * 80}px`,
              backgroundColor: gradeBarColor[grade] || "#64748b",
              minHeight: "4px",
            }}
          />
          <span className="text-xs font-medium">{grade}</span>
        </div>
      ))}
    </div>
  );
}

// --- Migration Modal ---

function MigrationModal({
  onMigrate,
  onSkip,
  onClose,
  migrating,
}: {
  onMigrate: () => void;
  onSkip: () => void;
  onClose: () => void;
  migrating: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-6 max-w-sm mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold">로컬 데이터를 서버로 이동</h3>
        <p className="text-sm text-[var(--muted)]">
          브라우저에 저장된 포트폴리오가 있습니다. 서버로 옮기면 어디서든 접근할 수 있습니다.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onMigrate}
            disabled={migrating}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {migrating ? "이동 중..." : "서버로 옮기기"}
          </button>
          <button
            onClick={onSkip}
            disabled={migrating}
            className="flex-1 px-4 py-2 bg-[var(--surface-hover)] rounded-lg text-sm font-medium hover:bg-[var(--card-border)] transition-colors"
          >
            건너뛰기
          </button>
        </div>
      </div>
    </div>
  );
}

// === Main Page ===

export default function PortfolioPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  // Storage mode
  const [mode, setMode] = useState<StorageMode>("server");
  const [showMigrationModal, setShowMigrationModal] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // State
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [holdings, setHoldings] = useState<PortfolioHolding[]>([]);
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [reportLimit, setReportLimit] = useState<{ remaining: number; limit: number } | null>(null);
  const [tab, setTab] = useState<"holdings" | "report">("holdings");
  const [loading, setLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StockSearchResult[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockSearchResult | null>(null);
  const [quantity, setQuantity] = useState("");
  const [avgPrice, setAvgPrice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addingHolding, setAddingHolding] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Init mode from localStorage
  useEffect(() => {
    setMode(getStorageMode());
  }, []);

  // Auth guard: only for server mode
  useEffect(() => {
    if (!authLoading && !isAuthenticated && mode === "server") {
      router.push("/auth/login");
    }
  }, [authLoading, isAuthenticated, router, mode]);

  // Close search dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Load portfolios
  const loadPortfolios = useCallback(async () => {
    try {
      const list = await getPortfolios();
      setPortfolios(list);
      if (list.length > 0 && !selectedId) {
        setSelectedId(list[0].id);
      } else if (list.length === 0) {
        // Auto-create first portfolio
        const created = await createPortfolioAdapter(mode === "local" ? "내 포트폴리오" : "내 포트폴리오");
        setPortfolios([{ id: created.id, name: created.name, holding_count: 0, created_at: created.created_at, updated_at: null }]);
        setSelectedId(created.id);
      }
    } catch (err: any) {
      if (err?.status === 401) {
        router.push("/auth/login");
        return;
      }
      setError("포트폴리오 로딩 실패");
    }
  }, [selectedId, router, mode]);

  useEffect(() => {
    // Server mode: need auth. Local mode: always load.
    if (mode === "server" && !isAuthenticated) return;
    loadPortfolios();
  }, [isAuthenticated, mode]);

  // Load holdings when portfolio changes
  const loadHoldings = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const data = await getHoldings(selectedId);
      setHoldings(data);
    } catch {
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      loadHoldings();
      // Try loading cached report
      fetchReportAdapter(selectedId)
        .then((res) => {
          if (res.success && res.data) setReport(res.data);
          else setReport(null);
        })
        .catch(() => setReport(null));
      // Load limit (only if logged in)
      if (isLoggedIn()) {
        fetchReportLimit()
          .then(setReportLimit)
          .catch(() => {});
      }
    }
  }, [selectedId, loadHoldings]);

  // Mode toggle handler
  const handleModeChange = (newMode: StorageMode) => {
    if (newMode === mode) return;

    if (newMode === "server") {
      // local -> server: check login
      if (!isLoggedIn()) {
        setToast("서버 저장 모드는 로그인이 필요합니다.");
        router.push("/auth/login");
        return;
      }
      // Check if local data exists for migration
      if (hasLocalData()) {
        setShowMigrationModal(true);
      }
    }

    setStorageMode(newMode);
    setMode(newMode);
    setSelectedId(null);
    setPortfolios([]);
    setHoldings([]);
    setReport(null);
    setToast(newMode === "local" ? "로컬 저장 모드로 전환되었습니다" : "서버 저장 모드로 전환되었습니다");
  };

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const result = await migrateLocalToServer();
      if (result.migrated > 0) {
        setToast(`${result.migrated}개 포트폴리오가 서버로 이동되었습니다.`);
      }
      if (result.failed > 0) {
        setToast(`일부 데이터 이동에 실패했습니다. (실패: ${result.failed})`);
      }
    } catch {
      setToast("데이터 이동에 실패했습니다.");
    } finally {
      setMigrating(false);
      setShowMigrationModal(false);
      // Reload in server mode
      loadPortfolios();
    }
  };

  const handleSkipMigration = () => {
    setShowMigrationModal(false);
    // Already switched to server; reload
    loadPortfolios();
  };

  // Search stocks
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.length < 1) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchStocks(q);
        setSearchResults(res.results || []);
        setSearchOpen(true);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, []);

  // Add holding
  const handleAddHolding = async () => {
    if (!selectedId || !selectedStock || !quantity || !avgPrice) return;
    setAddingHolding(true);
    try {
      const currency = selectedStock.market === "NYSE" || selectedStock.market === "NASDAQ" ? "USD" : "KRW";
      await addHoldingAdapter(selectedId, {
        ticker: selectedStock.ticker,
        name: selectedStock.name,
        market: selectedStock.market,
        quantity: parseFloat(quantity),
        avg_buy_price: parseFloat(avgPrice),
        currency,
      });
      setSelectedStock(null);
      setSearchQuery("");
      setQuantity("");
      setAvgPrice("");
      setReport(null);
      setToast("종목이 추가되었습니다.");
      loadHoldings();
      loadPortfolios();
    } catch (err: any) {
      setToast(err?.message || "종목 추가 실패");
    } finally {
      setAddingHolding(false);
    }
  };

  // Delete holding
  const handleDeleteHolding = async (holdingId: number) => {
    if (!selectedId) return;
    try {
      await deleteHoldingAdapter(selectedId, holdingId);
      setToast("종목이 삭제되었습니다.");
      setReport(null);
      loadHoldings();
      loadPortfolios();
    } catch {
      setToast("종목 삭제 실패");
    }
  };

  // Generate report
  const handleGenerateReport = async () => {
    if (!selectedId) return;
    // Local mode + not logged in -> prompt login
    if (mode === "local" && !isLoggedIn()) {
      setToast("리포트 생성은 로그인이 필요합니다.");
      router.push("/auth/login");
      return;
    }
    setReportLoading(true);
    setError(null);
    try {
      const res = await generateReportAdapter(selectedId, holdings);
      if (res.success) {
        setReport(res.data);
        setTab("report");
        if (isLoggedIn()) {
          fetchReportLimit().then(setReportLimit).catch(() => {});
        }
      }
    } catch (err: any) {
      if (err?.status === 429) {
        setToast("일일 리포트 생성 횟수(5회)를 초과했습니다.");
      } else if (err?.status === 401) {
        router.push("/auth/login");
      } else {
        setToast(err?.message || "리포트 생성 실패");
      }
    } finally {
      setReportLoading(false);
    }
  };

  // Delete portfolio
  const handleDeletePortfolio = async () => {
    if (!selectedId || portfolios.length <= 1) return;
    if (!confirm("이 포트폴리오를 삭제하시겠습니까?")) return;
    try {
      await deletePortfolioAdapter(selectedId);
      setSelectedId(null);
      setReport(null);
      loadPortfolios();
    } catch {
      setToast("삭제 실패");
    }
  };

  // Create new portfolio
  const handleCreatePortfolio = async () => {
    const name = prompt("포트폴리오 이름", "내 포트폴리오");
    if (!name) return;
    try {
      const created = await createPortfolioAdapter(name);
      setSelectedId(created.id);
      loadPortfolios();
    } catch (err: any) {
      setToast(err?.message || "생성 실패");
    }
  };

  // Holdings totals
  const totalInvested = holdings.reduce((s, h) => s + h.invested, 0);
  const totalEval = holdings.reduce((s, h) => s + h.eval_amount, 0);
  const totalPnl = totalEval - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Server mode + not logged in -> redirect (handled by useEffect)
  if (mode === "server" && !isAuthenticated) return null;

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-[var(--card)] border border-[var(--card-border)] px-4 py-3 rounded-lg shadow-lg text-sm animate-in slide-in-from-top">
          {toast}
        </div>
      )}

      {/* Migration Modal */}
      {showMigrationModal && (
        <MigrationModal
          onMigrate={handleMigrate}
          onSkip={handleSkipMigration}
          onClose={() => setShowMigrationModal(false)}
          migrating={migrating}
        />
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">포트폴리오</h1>
          <p className="text-sm text-[var(--muted)]">보유 종목을 등록하고 AI 리포트를 생성하세요</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Storage mode toggle */}
          <div className="flex items-center gap-2 bg-[var(--surface-hover)] rounded-lg px-3 py-1.5">
            <span className="text-xs text-[var(--muted)]">
              {mode === "local" ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-0.5"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="inline mr-0.5"><path d="M22 12H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
              )}
            </span>
            <button
              onClick={() => handleModeChange("local")}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${mode === "local" ? "bg-[var(--card)] shadow-sm font-medium" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
            >
              로컬
            </button>
            <button
              onClick={() => handleModeChange("server")}
              className={`text-xs px-2 py-0.5 rounded transition-colors ${mode === "server" ? "bg-[var(--card)] shadow-sm font-medium" : "text-[var(--muted)] hover:text-[var(--foreground)]"}`}
            >
              서버
            </button>
          </div>

          {/* Portfolio Selector */}
          <select
            value={selectedId || ""}
            onChange={(e) => {
              setSelectedId(Number(e.target.value));
              setReport(null);
            }}
            className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm"
          >
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.holding_count}종목)
              </option>
            ))}
          </select>
          <button
            onClick={handleCreatePortfolio}
            className="p-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors text-sm"
            title="새 포트폴리오"
          >
            +
          </button>
          {portfolios.length > 1 && (
            <button
              onClick={handleDeletePortfolio}
              className="p-2 rounded-lg bg-red-600/20 text-red-400 hover:bg-red-600/30 transition-colors text-sm"
              title="삭제"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Mode indicator */}
      {mode === "local" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 text-xs text-amber-400 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          이 브라우저에만 저장됩니다. 다른 기기에서는 접근할 수 없습니다.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-[var(--surface-hover)] rounded-lg p-1">
        <button
          onClick={() => setTab("holdings")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "holdings" ? "bg-[var(--card)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          보유 종목
        </button>
        <button
          onClick={() => setTab("report")}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === "report" ? "bg-[var(--card)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          리포트
        </button>
      </div>

      {/* Holdings Tab */}
      {tab === "holdings" && (
        <div className="space-y-4">
          {/* Add Holding Form */}
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-[var(--muted)]">종목 추가</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* Search */}
              <div className="sm:col-span-2 relative" ref={searchRef}>
                <input
                  type="text"
                  value={selectedStock ? `${selectedStock.name} (${selectedStock.ticker})` : searchQuery}
                  onChange={(e) => {
                    setSelectedStock(null);
                    handleSearch(e.target.value);
                  }}
                  onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
                  placeholder="종목명 또는 코드 검색..."
                  className="w-full bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {searchOpen && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-20 mt-1 bg-[var(--card)] border border-[var(--card-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {searchResults.map((r) => (
                      <button
                        key={r.ticker}
                        onClick={() => {
                          setSelectedStock(r);
                          setSearchQuery("");
                          setSearchOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--surface-hover)] flex items-center justify-between"
                      >
                        <span>
                          <span className="font-medium">{r.name}</span>
                          <span className="text-[var(--muted)] ml-1">({r.ticker})</span>
                        </span>
                        <span className="text-xs text-[var(--muted)]">{r.market}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Quantity */}
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="수량"
                min="0.01"
                step="any"
                className="bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {/* Avg Price */}
              <div className="flex gap-2">
                <input
                  type="number"
                  value={avgPrice}
                  onChange={(e) => setAvgPrice(e.target.value)}
                  placeholder="매수가"
                  min="0"
                  step="0.01"
                  className="flex-1 bg-[var(--surface-hover)] border border-[var(--card-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={handleAddHolding}
                  disabled={!selectedStock || !quantity || !avgPrice || addingHolding}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                >
                  {addingHolding ? "..." : "추가"}
                </button>
              </div>
            </div>
          </div>

          {/* Holdings Table */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : holdings.length === 0 ? (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-12 text-center">
              <p className="text-[var(--muted)]">보유 종목이 없습니다. 위에서 종목을 추가해주세요.</p>
            </div>
          ) : (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--card-border)] text-[var(--muted)] text-xs">
                      <th className="text-left px-4 py-3">종목</th>
                      <th className="text-right px-4 py-3">수량</th>
                      <th className="text-right px-4 py-3">매수가</th>
                      <th className="text-right px-4 py-3">현재가</th>
                      <th className="text-right px-4 py-3">평가금</th>
                      <th className="text-right px-4 py-3">손익</th>
                      <th className="text-right px-4 py-3">수익률</th>
                      <th className="text-center px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.map((h) => (
                      <tr key={h.id} className="border-b border-[var(--card-border)] hover:bg-[var(--surface-hover)]">
                        <td className="px-4 py-3">
                          <div className="font-medium">{h.name}</div>
                          <div className="text-xs text-[var(--muted)]">{h.ticker} · {h.market}</div>
                        </td>
                        <td className="text-right px-4 py-3">{h.quantity.toLocaleString()}</td>
                        <td className="text-right px-4 py-3">{h.avg_buy_price.toLocaleString()}</td>
                        <td className="text-right px-4 py-3">{h.current_price.toLocaleString()}</td>
                        <td className="text-right px-4 py-3">{h.eval_amount.toLocaleString()}원</td>
                        <td className={`text-right px-4 py-3 ${pnlColor(h.pnl)}`}>
                          {pnlPrefix(h.pnl)}{h.pnl.toLocaleString()}원
                        </td>
                        <td className={`text-right px-4 py-3 font-medium ${pnlColor(h.pnl_pct)}`}>
                          {pnlPrefix(h.pnl_pct)}{h.pnl_pct.toFixed(2)}%
                        </td>
                        <td className="text-center px-4 py-3">
                          <button
                            onClick={() => handleDeleteHolding(h.id)}
                            className="text-[var(--muted)] hover:text-red-400 transition-colors"
                            title="삭제"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {/* Totals */}
                    <tr className="bg-[var(--surface-hover)] font-medium">
                      <td className="px-4 py-3" colSpan={4}>합계</td>
                      <td className="text-right px-4 py-3">{totalEval.toLocaleString()}원</td>
                      <td className={`text-right px-4 py-3 ${pnlColor(totalPnl)}`}>
                        {pnlPrefix(totalPnl)}{totalPnl.toLocaleString()}원
                      </td>
                      <td className={`text-right px-4 py-3 ${pnlColor(totalPnlPct)}`}>
                        {pnlPrefix(totalPnlPct)}{totalPnlPct.toFixed(2)}%
                      </td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Report Tab */}
      {tab === "report" && (
        <div className="space-y-4">
          {/* Generate Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading || holdings.length === 0}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {reportLoading ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  분석 중...
                </>
              ) : (
                "리포트 생성"
              )}
            </button>
            {reportLimit && (
              <span className="text-xs text-[var(--muted)] bg-[var(--surface-hover)] px-2.5 py-1 rounded-full">
                잔여 {reportLimit.remaining}/{reportLimit.limit}회
              </span>
            )}
            {report && (
              <span className="text-xs text-[var(--muted)]">
                {new Date(report.generated_at).toLocaleString("ko-KR")} 생성
              </span>
            )}
            {mode === "local" && !isLoggedIn() && (
              <span className="text-xs text-amber-400">
                리포트 생성은 로그인이 필요합니다
              </span>
            )}
          </div>

          {reportLoading && (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-12 text-center space-y-3">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
              <p className="text-sm text-[var(--muted)]">종목별 기술적 분석 + AI 코멘트 생성 중...</p>
              <p className="text-xs text-[var(--muted)]">보유 종목 수에 따라 10~30초 소요됩니다</p>
            </div>
          )}

          {!reportLoading && !report && (
            <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-12 text-center">
              <p className="text-[var(--muted)]">
                {holdings.length === 0
                  ? "먼저 보유 종목을 추가한 후 리포트를 생성해주세요."
                  : "\"리포트 생성\" 버튼을 눌러 포트폴리오 분석을 시작하세요."}
              </p>
            </div>
          )}

          {!reportLoading && report && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
                  <p className="text-xs text-[var(--muted)]">총 투자금</p>
                  <p className="text-lg font-bold mt-1">{report.summary.total_invested.toLocaleString()}<span className="text-xs text-[var(--muted)] ml-1">원</span></p>
                </div>
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
                  <p className="text-xs text-[var(--muted)]">총 평가금</p>
                  <p className="text-lg font-bold mt-1">{report.summary.total_eval.toLocaleString()}<span className="text-xs text-[var(--muted)] ml-1">원</span></p>
                </div>
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
                  <p className="text-xs text-[var(--muted)]">총 수익률</p>
                  <p className={`text-lg font-bold mt-1 ${pnlColor(report.summary.total_pnl_pct)}`}>
                    {pnlPrefix(report.summary.total_pnl_pct)}{report.summary.total_pnl_pct.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4">
                  <p className="text-xs text-[var(--muted)]">보유 종목</p>
                  <p className="text-lg font-bold mt-1">{report.summary.holding_count}<span className="text-xs text-[var(--muted)] ml-1">종목</span></p>
                </div>
              </div>

              {/* LLM Comment */}
              <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">AI 분석 코멘트</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${riskColor(report.comment.risk_level)}`}>
                    위험도: {riskLabel(report.comment.risk_level)}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{report.comment.overall_assessment}</p>
                {report.comment.key_risks.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] mb-1.5">주요 리스크</p>
                    <ul className="space-y-1">
                      {report.comment.key_risks.map((r, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-orange-400 mt-0.5">!</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {report.comment.action_items.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[var(--muted)] mb-1.5">조치 사항</p>
                    <ul className="space-y-1">
                      {report.comment.action_items.map((a, i) => (
                        <li key={i} className="text-sm flex gap-2">
                          <span className="text-blue-400 mt-0.5">→</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Holding Weight Donut */}
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
                  <p className="text-sm font-semibold mb-3">종목 비중</p>
                  <DonutChart
                    data={report.holdings.map((h, i) => ({
                      label: h.name,
                      value: h.eval_amount,
                      color: DONUT_COLORS[i % DONUT_COLORS.length],
                    }))}
                  />
                </div>
                {/* Grade Distribution */}
                <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-5">
                  <p className="text-sm font-semibold mb-3">등급 분포</p>
                  <GradeBarChart distribution={report.summary.grade_distribution} />
                  {/* Signal distribution */}
                  <div className="mt-4 flex gap-3">
                    {Object.entries(report.summary.signal_distribution).map(([signal, count]) => (
                      <div key={signal} className="flex items-center gap-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${signalColor(signal)}`}>{signal}</span>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Holding Analysis Cards */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-[var(--muted)]">종목별 분석</h3>
                <div className="space-y-3">
                  {report.holdings.map((h) => {
                    const holdingComment = report.comment.holding_comments?.[h.ticker];
                    const trendLabel = h.trend === "uptrend" ? "상승" : h.trend === "downtrend" ? "하락" : "횡보";
                    const trendColor = h.trend === "uptrend" ? "text-green-400" : h.trend === "downtrend" ? "text-red-400" : "text-[var(--muted)]";
                    const rsiColor = h.rsi < 30 ? "text-green-400" : h.rsi > 70 ? "text-red-400" : "text-[var(--muted)]";
                    return (
                      <div key={h.ticker} className="bg-[var(--card)] border border-[var(--card-border)] rounded-xl p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="font-medium">{h.name}</span>
                            <span className="text-xs text-[var(--muted)] ml-1">({h.ticker})</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeColor(h.grade)}`}>{h.grade}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${signalColor(h.signal)}`}>{h.signal}</span>
                          </div>
                        </div>

                        {/* Metrics Row */}
                        <div className="grid grid-cols-5 gap-2 text-xs">
                          <div>
                            <span className="text-[var(--muted)]">수익률</span>
                            <p className={`font-medium ${pnlColor(h.pnl_pct)}`}>{pnlPrefix(h.pnl_pct)}{h.pnl_pct.toFixed(2)}%</p>
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">신뢰도</span>
                            <p className="font-medium">{h.confidence}%</p>
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">RSI</span>
                            <p className={`font-medium ${rsiColor}`}>{h.rsi}</p>
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">추세</span>
                            <p className={`font-medium ${trendColor}`}>{trendLabel}{h.trend_strength > 0 ? ` ${(h.trend_strength * 100).toFixed(0)}%` : ""}</p>
                          </div>
                          <div>
                            <span className="text-[var(--muted)]">점수</span>
                            <p className="font-medium">{h.total_score}</p>
                          </div>
                        </div>

                        {/* Price Info */}
                        <div className="flex justify-between text-xs text-[var(--muted)]">
                          <span>매수 {h.avg_buy_price.toLocaleString()} → 현재 {h.current_price.toLocaleString()}</span>
                          <span className={pnlColor(h.pnl)}>{pnlPrefix(h.pnl)}{h.pnl.toLocaleString()}원</span>
                        </div>

                        {/* AI Comment for this holding */}
                        {holdingComment && (
                          <div className="bg-[var(--surface-hover)] rounded-lg px-3 py-2">
                            <p className="text-xs leading-relaxed">{holdingComment}</p>
                          </div>
                        )}

                        {/* Confidence Adjustments */}
                        {h.confidence_adjustments && h.confidence_adjustments.length > 0 && (
                          <div className="border-t border-[var(--card-border)] pt-2">
                            <p className="text-[10px] font-semibold text-[var(--muted)] mb-1">신뢰도 근거</p>
                            <div className="flex flex-wrap gap-1">
                              {h.confidence_adjustments.map((adj, i) => {
                                const isPositive = adj.delta.startsWith("+");
                                return (
                                  <span
                                    key={i}
                                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                                      isPositive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                    }`}
                                  >
                                    {adj.factor} {adj.delta}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* ScoringEngine Summary */}
                        {h.summary && h.summary.length > 0 && (
                          <details className="border-t border-[var(--card-border)] pt-2">
                            <summary className="text-[10px] font-semibold text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] transition-colors">
                              기술적 분석 상세
                            </summary>
                            <div className="mt-1.5 space-y-1">
                              {h.summary.map((line, i) => (
                                <p key={i} className="text-[11px] text-[var(--muted)] leading-relaxed">{line}</p>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
