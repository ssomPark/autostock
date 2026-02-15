const API_BASE = "/api";

async function fetchJSON(url: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API Error: ${res.status}`);
  return res.json();
}

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

// SSE connects directly to the backend to avoid Next.js proxy buffering
const BACKEND_URL = "http://localhost:8000";

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
