import { getAccessToken, fetchWatchlistAPI, addToWatchlistAPI, removeFromWatchlistAPI } from "@/lib/api";

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

function isLoggedIn(): boolean {
  return !!getAccessToken();
}

// --- localStorage helpers (fallback for non-logged-in users) ---

function getLocalWatchlist(): WatchlistItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setLocalWatchlist(items: WatchlistItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("watchlist-updated"));
}

// --- Hybrid API (async) ---

export async function getWatchlist(): Promise<WatchlistItem[]> {
  if (isLoggedIn()) {
    try {
      return await fetchWatchlistAPI();
    } catch {
      return getLocalWatchlist();
    }
  }
  return getLocalWatchlist();
}

export async function addToWatchlist(item: WatchlistItem): Promise<void> {
  if (isLoggedIn()) {
    await addToWatchlistAPI(item as unknown as Record<string, unknown>);
  } else {
    const list = getLocalWatchlist().filter((w) => w.ticker !== item.ticker);
    list.unshift(item);
    setLocalWatchlist(list);
  }
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  if (isLoggedIn()) {
    await removeFromWatchlistAPI(ticker);
  } else {
    const list = getLocalWatchlist().filter((w) => w.ticker !== ticker);
    setLocalWatchlist(list);
  }
}

export async function isInWatchlist(ticker: string): Promise<boolean> {
  const list = await getWatchlist();
  return list.some((w) => w.ticker === ticker);
}

// --- Sync helpers for non-logged-in fallback (used by components that need sync access) ---

export function getWatchlistSync(): WatchlistItem[] {
  return getLocalWatchlist();
}

// --- Migration: localStorage → server ---

export async function migrateLocalToServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const localItems = getLocalWatchlist();
  if (localItems.length === 0) return;

  try {
    for (const item of localItems) {
      await addToWatchlistAPI(item as unknown as Record<string, unknown>);
    }
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Keep localStorage if migration fails
  }
}
