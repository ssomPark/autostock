const API_BASE = "/api";

// In production (behind reverse proxy), use same origin ("").
// In local dev, fall back to direct backend URL to avoid Next.js SSE buffering.
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// --- Auth token management ---
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// --- Rate limit tracking ---

let _analysisRemaining: number | null = null;
let _analysisResetSeconds: number | null = null;

export function getAnalysisRemaining(): number | null {
  return _analysisRemaining;
}

export function getAnalysisResetSeconds(): number | null {
  return _analysisResetSeconds;
}

export class RateLimitError extends Error {
  limit: number;
  remaining: number;
  resetSeconds: number;
  constructor(limit: number, remaining: number, resetSeconds: number) {
    super("일일 무료 분석 횟수를 초과했습니다.");
    this.name = "RateLimitError";
    this.limit = limit;
    this.remaining = remaining;
    this.resetSeconds = resetSeconds;
  }
}

// --- Base fetch helpers ---

async function fetchJSON(url: string, options?: RequestInit) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  const res = await fetch(`${API_BASE}${url}`, {
    headers,
    ...options,
  });

  // Track rate limit from analysis endpoints
  const remaining = res.headers.get("X-RateLimit-Remaining");
  const resetSec = res.headers.get("X-RateLimit-Reset");
  if (remaining !== null) {
    _analysisRemaining = parseInt(remaining, 10);
  }
  if (resetSec !== null) {
    _analysisResetSeconds = parseInt(resetSec, 10);
  }

  if (res.status === 429) {
    const limit = parseInt(res.headers.get("X-RateLimit-Limit") || "5", 10);
    const reset = parseInt(resetSec || "86400", 10);
    _analysisRemaining = 0;
    _analysisResetSeconds = reset;
    throw new RateLimitError(limit, 0, reset);
  }

  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

async function fetchWithAuth(url: string, options?: RequestInit) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }

  let res = await fetch(`${BACKEND_URL}${url}`, {
    headers,
    credentials: "include",
    ...options,
  });

  // If 401 and we have a token, try refreshing
  if (res.status === 401 && _accessToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${_accessToken}`;
      res = await fetch(`${BACKEND_URL}${url}`, {
        headers,
        credentials: "include",
        ...options,
      });
    }
  }

  if (!res.ok) {
    const err = new Error(`API Error: ${res.status}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// --- Auth API ---

export async function refreshAccessToken(): Promise<boolean> {
  try {
    // Skip if user never logged in before (avoids 401 console noise for anonymous users)
    if (typeof localStorage !== "undefined" && !localStorage.getItem("tr_has_session")) {
      return false;
    }
    const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) {
      // Session expired — clear the flag
      if (typeof localStorage !== "undefined") localStorage.removeItem("tr_has_session");
      return false;
    }
    const data = await res.json();
    if (data.access_token) {
      _accessToken = data.access_token;
      if (typeof localStorage !== "undefined") localStorage.setItem("tr_has_session", "1");
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function fetchMe() {
  return fetchWithAuth("/api/auth/me");
}

export async function logoutAPI() {
  await fetch(`${BACKEND_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
  _accessToken = null;
}

// --- Watchlist API (authenticated, direct to backend) ---

export async function fetchWatchlistAPI() {
  return fetchWithAuth("/api/watchlist");
}

export async function addToWatchlistAPI(item: Record<string, unknown>) {
  return fetchWithAuth("/api/watchlist", {
    method: "POST",
    body: JSON.stringify(item),
  });
}

export async function removeFromWatchlistAPI(ticker: string) {
  return fetchWithAuth(`/api/watchlist/${ticker}`, {
    method: "DELETE",
  });
}

// --- Saved Analyses API (authenticated, direct to backend) ---

export async function fetchSavedAnalyses() {
  return fetchWithAuth("/api/saved-analyses");
}

export async function fetchSavedAnalysis(ticker: string) {
  return fetchWithAuth(`/api/saved-analyses/${ticker}`);
}

export async function saveAnalysisAPI(data: Record<string, unknown>) {
  return fetchWithAuth("/api/saved-analyses", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deleteSavedAnalysisAPI(id: number) {
  return fetchWithAuth(`/api/saved-analyses/${id}`, {
    method: "DELETE",
  });
}

// --- Public API (proxied through Next.js) ---

export function fetchRecommendations(params: { market: string; action: string }) {
  const qs = new URLSearchParams(params).toString();
  return fetchJSON(`/recommendations?${qs}`);
}

export interface StockSearchResult {
  ticker: string;
  name: string;
  market: string;
}

export function searchStocks(q: string): Promise<{ results: StockSearchResult[] }> {
  return fetchJSON(`/analysis/search?q=${encodeURIComponent(q)}`);
}

export function fetchAnalysis(ticker: string, market: string) {
  return fetchJSON(`/analysis/${ticker}?market=${market}`);
}

export function fetchNews(limit = 20) {
  return fetchJSON(`/news?limit=${limit}`);
}

export function fetchPipelineStatus() {
  return fetchJSON("/pipeline/status");
}

export function fetchPipelineHistory(limit: number = 10) {
  return fetchJSON(`/pipeline/history?limit=${limit}`);
}

export function triggerPipeline(market: string) {
  return fetchWithAuth(`/api/pipeline/run?market=${market}`, { method: "POST" });
}

export function fetchOHLCV(ticker: string, market: string) {
  return fetchJSON(`/analysis/${ticker}/ohlcv?market=${market}`);
}

export function fetchFinancials(ticker: string, market: string) {
  return fetchJSON(`/analysis/${ticker}/financials?market=${market}`);
}

export function fetchScore(ticker: string, market: string) {
  return fetchJSON(`/analysis/${ticker}/score?market=${market}`);
}

export function fetchDashboardSummary() {
  return fetchJSON("/recommendations/summary/dashboard");
}

// --- Paper Trading API (authenticated, direct to backend) ---

export async function fetchPaperAccounts() {
  return fetchWithAuth("/api/paper/accounts");
}

export async function createPaperAccount(data: { name?: string; initial_balance?: number; currency?: string }) {
  return fetchWithAuth("/api/paper/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function deletePaperAccount(accountId: number) {
  return fetchWithAuth(`/api/paper/accounts/${accountId}`, {
    method: "DELETE",
  });
}

export async function resetPaperAccount(accountId: number) {
  return fetchWithAuth(`/api/paper/accounts/${accountId}/reset`, {
    method: "POST",
  });
}

export async function executePaperBuy(data: {
  account_id: number;
  ticker: string;
  name: string;
  market: string;
  quantity: number;
  price: number;
  source?: string;
  recommendation_id?: number;
  recommendation_action?: string;
  recommendation_confidence?: number;
  recommendation_grade?: string;
}) {
  return fetchWithAuth("/api/paper/buy", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function executePaperSell(data: {
  account_id: number;
  ticker: string;
  quantity: number;
  price: number;
}) {
  return fetchWithAuth("/api/paper/sell", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function fetchPaperPositions(accountId: number) {
  return fetchWithAuth(`/api/paper/positions/${accountId}`);
}

export async function fetchPaperTrades(accountId: number, filters?: { ticker?: string; side?: string; source?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (filters?.ticker) params.set("ticker", filters.ticker);
  if (filters?.side) params.set("side", filters.side);
  if (filters?.source) params.set("source", filters.source);
  if (filters?.limit) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return fetchWithAuth(`/api/paper/trades/${accountId}${qs ? `?${qs}` : ""}`);
}

export async function fetchPaperSummary(accountId: number) {
  return fetchWithAuth(`/api/paper/summary/${accountId}`);
}

export async function fetchExchangeRate(): Promise<{ rate: number; pair: string }> {
  return fetchWithAuth("/api/paper/exchange-rate");
}

// --- Deposit API ---

export async function depositPaperAccount(accountId: number, amount: number): Promise<{
  ok: boolean;
  deposit_amount: number;
  new_cash_balance: number;
  new_bonus_balance: number;
}> {
  return fetchWithAuth("/api/paper/deposit", {
    method: "POST",
    body: JSON.stringify({ account_id: accountId, amount }),
  });
}

// --- Ad Reward API ---

export interface AdRewardStatus {
  can_watch: boolean;
  cooldown_remaining: number;
  next_available_at: string | null;
  total_earned: number;
  today_count: number;
}

export interface AdRewardClaimResponse {
  ok: boolean;
  reward_amount: number;
  new_cash_balance: number;
  new_bonus_balance: number;
}

export async function fetchAdRewardStatus(accountId: number): Promise<AdRewardStatus> {
  return fetchWithAuth(`/api/paper/ad-reward/status?account_id=${accountId}`);
}

export async function requestAdReward(accountId: number): Promise<{ reward_token: string | null; can_watch: boolean; cooldown_remaining: number }> {
  return fetchWithAuth("/api/paper/ad-reward/request", {
    method: "POST",
    body: JSON.stringify({ account_id: accountId }),
  });
}

export async function claimAdReward(token: string, accountId: number): Promise<AdRewardClaimResponse> {
  return fetchWithAuth("/api/paper/ad-reward/claim", {
    method: "POST",
    body: JSON.stringify({ reward_token: token, account_id: accountId }),
  });
}

// --- Leaderboard API ---

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  user_name: string;
  user_avatar: string | null;
  account_name: string;
  initial_balance: number;
  total_value: number;
  total_pnl: number;
  return_pct: number;
  trade_count: number;
  position_count: number;
}

export interface LeaderboardResponse {
  entries: LeaderboardEntry[];
  current_user_id: number | null;
  updated_at: string;
}

export async function fetchLeaderboard(): Promise<LeaderboardResponse> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_accessToken) {
    headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  const res = await fetch(`${BACKEND_URL}/api/paper/leaderboard`, {
    headers,
    credentials: "include",
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// --- Live Prices API ---

export interface LivePrice {
  ticker: string;
  market: string;
  rec_price: number;
  live_price: number;
  change_from_rec: number;
  day_change_pct: number;
  volume: number;
}

export interface MarketStatusInfo {
  is_open: boolean;
  local_time: string;
  timezone: string;
  hours: string;
  holiday?: boolean;
}

export interface MarketStatusResponse {
  success: boolean;
  data: {
    KR: MarketStatusInfo;
    US: MarketStatusInfo;
  };
}

export interface BatchPriceResponse {
  success: boolean;
  data: LivePrice[];
  market_status: {
    KR: MarketStatusInfo;
    US: MarketStatusInfo;
  };
}

export function fetchBatchPrices(market: string = "all"): Promise<BatchPriceResponse> {
  return fetchJSON(`/prices/batch?market=${market}`);
}

export function fetchMarketStatus(): Promise<MarketStatusResponse> {
  return fetchJSON("/prices/market-status");
}

// --- Events API (proxied through Next.js) ---

export interface EventStock {
  id: number;
  event_id: number;
  ticker: string;
  name: string;
  market: string;
  relation_type: "direct" | "indirect" | "sector";
  expected_impact: "positive" | "negative" | "neutral";
  reasoning: string;
  created_at: string;
}

export interface MarketEvent {
  id: number;
  title: string;
  description: string;
  event_date: string;
  category: string;
  impact_level: "high" | "medium" | "low";
  source_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  stocks: EventStock[];
  days_until: number | null;
}

export interface EventsResponse {
  success: boolean;
  data: MarketEvent[];
  count: number;
}

export function fetchEvents(params?: {
  year?: number;
  month?: number;
  category?: string;
  upcoming_days?: number;
  include_past?: boolean;
}): Promise<EventsResponse> {
  const qs = new URLSearchParams();
  if (params?.year) qs.set("year", String(params.year));
  if (params?.month) qs.set("month", String(params.month));
  if (params?.category) qs.set("category", params.category);
  if (params?.upcoming_days) qs.set("upcoming_days", String(params.upcoming_days));
  if (params?.include_past) qs.set("include_past", "true");
  const q = qs.toString();
  return fetchJSON(`/events${q ? `?${q}` : ""}`);
}

export function fetchEvent(eventId: number): Promise<{ success: boolean; data: MarketEvent }> {
  return fetchJSON(`/events/${eventId}`);
}

export function createEvent(data: {
  title: string;
  description?: string;
  event_date: string;
  category: string;
  impact_level?: string;
  source_url?: string;
  stocks?: Array<{
    ticker: string;
    name: string;
    market: string;
    relation_type?: string;
    expected_impact?: string;
    reasoning?: string;
  }>;
}): Promise<{ success: boolean; data: MarketEvent }> {
  return fetchJSON("/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateEvent(
  eventId: number,
  data: Record<string, unknown>,
): Promise<{ success: boolean; data: MarketEvent }> {
  return fetchJSON(`/events/${eventId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteEvent(eventId: number): Promise<{ success: boolean }> {
  return fetchJSON(`/events/${eventId}`, { method: "DELETE" });
}

export function addEventStock(
  eventId: number,
  stock: {
    ticker: string;
    name: string;
    market: string;
    relation_type?: string;
    expected_impact?: string;
    reasoning?: string;
  },
): Promise<{ success: boolean; data: EventStock }> {
  return fetchJSON(`/events/${eventId}/stocks`, {
    method: "POST",
    body: JSON.stringify(stock),
  });
}

export function removeEventStock(eventId: number, stockId: number): Promise<{ success: boolean }> {
  return fetchJSON(`/events/${eventId}/stocks/${stockId}`, { method: "DELETE" });
}

// --- Admin API (authenticated, direct to backend) ---

export async function fetchAdminDashboard() {
  return fetchWithAuth("/api/admin/dashboard");
}

export async function fetchAdminUsers(params?: { search?: string; page?: number; size?: number }) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  const q = qs.toString();
  return fetchWithAuth(`/api/admin/users${q ? `?${q}` : ""}`);
}

export async function fetchAdminUserDetail(userId: number) {
  return fetchWithAuth(`/api/admin/users/${userId}`);
}

export async function fetchAdminAdRewards(params?: { status?: string; user_id?: number; page?: number; size?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.user_id) qs.set("user_id", String(params.user_id));
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  const q = qs.toString();
  return fetchWithAuth(`/api/admin/ad-rewards${q ? `?${q}` : ""}`);
}

export async function fetchAdminAdRewardStats() {
  return fetchWithAuth("/api/admin/ad-rewards/stats");
}

export async function fetchAdminAdRewardSettings() {
  return fetchWithAuth("/api/admin/ad-rewards/settings");
}

export async function fetchAdminPaperTradingStats() {
  return fetchWithAuth("/api/admin/paper-trading/stats");
}

export async function fetchAdminEvents(params?: { page?: number; size?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.size) qs.set("size", String(params.size));
  const q = qs.toString();
  return fetchWithAuth(`/api/admin/events${q ? `?${q}` : ""}`);
}

export async function toggleAdminEventActive(eventId: number) {
  return fetchWithAuth(`/api/admin/events/${eventId}/toggle-active`, { method: "PATCH" });
}

export function subscribePipelineStream(
  onEvent: (data: Record<string, unknown>) => void,
  onError?: (err: Event) => void,
  onConnected?: (connected: boolean) => void,
): () => void {
  const es = new EventSource(`${BACKEND_URL}/api/pipeline/stream`);

  es.onopen = () => {
    onConnected?.(true);
  };

  es.onmessage = (event) => {
    onConnected?.(true);
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = (err) => {
    if (es.readyState === EventSource.CLOSED) {
      onConnected?.(false);
      onError?.(err);
    }
  };

  return () => es.close();
}
