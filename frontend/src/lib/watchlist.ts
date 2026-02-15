const STORAGE_KEY = "autostock-watchlist";

export interface WatchlistItem {
  ticker: string;
  name: string;
  market: string;
  action: string;
  grade: string;
  confidence: number;
  current_price: number;
  change_pct: number | null;
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  risk_reward: number | null;
  added_at: string;
}

export function getWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addToWatchlist(item: WatchlistItem): WatchlistItem[] {
  const list = getWatchlist().filter((w) => w.ticker !== item.ticker);
  list.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("watchlist-updated"));
  return list;
}

export function removeFromWatchlist(ticker: string): WatchlistItem[] {
  const list = getWatchlist().filter((w) => w.ticker !== ticker);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new Event("watchlist-updated"));
  return list;
}

export function isInWatchlist(ticker: string): boolean {
  return getWatchlist().some((w) => w.ticker === ticker);
}
