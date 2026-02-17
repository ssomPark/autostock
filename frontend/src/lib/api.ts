const API_BASE = "/api";

// SSE connects directly to the backend to avoid Next.js proxy buffering
const BACKEND_URL = "http://localhost:8000";

// --- Auth token management ---
let _accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

// --- Base fetch helpers ---

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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

  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

// --- Auth API ---

export async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.access_token) {
      _accessToken = data.access_token;
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
  return fetchJSON(`/pipeline/run?market=${market}`, { method: "POST" });
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
