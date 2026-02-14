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

export function fetchDashboardSummary() {
  return fetchJSON("/recommendations/summary/dashboard");
}
