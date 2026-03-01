/**
 * Portfolio storage abstraction: local (localStorage) or server (API).
 * Mode is user-selectable, not determined by login status.
 */

import {
  getAccessToken,
  fetchPortfolios,
  createPortfolio,
  deletePortfolio,
  fetchPortfolioHoldings,
  addPortfolioHolding,
  deletePortfolioHolding,
  enrichHoldings,
  generatePortfolioReport,
  generateAdhocReport,
  fetchPortfolioReport,
  type Portfolio,
  type PortfolioHolding,
} from "@/lib/api";

// --- Constants ---

const STORAGE_MODE_KEY = "traderadar-portfolio-mode";
const LOCAL_PORTFOLIOS_KEY = "traderadar-portfolio-local";

export type StorageMode = "local" | "server";

// --- Local data types ---

export interface LocalHolding {
  id: number;
  ticker: string;
  name: string;
  market: string;
  quantity: number;
  avg_buy_price: number;
  currency: string;
  added_at: string;
}

export interface LocalPortfolio {
  id: number;
  name: string;
  holdings: LocalHolding[];
  created_at: string;
  updated_at: string;
}

// --- Mode management ---

export function getStorageMode(): StorageMode {
  if (typeof window === "undefined") return "server";
  return (localStorage.getItem(STORAGE_MODE_KEY) as StorageMode) || "server";
}

export function setStorageMode(mode: StorageMode) {
  localStorage.setItem(STORAGE_MODE_KEY, mode);
}

export function isLocalMode(): boolean {
  return getStorageMode() === "local";
}

// --- Local CRUD ---

function _readLocal(): LocalPortfolio[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_PORTFOLIOS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function _writeLocal(portfolios: LocalPortfolio[]) {
  localStorage.setItem(LOCAL_PORTFOLIOS_KEY, JSON.stringify(portfolios));
}

export function getLocalPortfolios(): LocalPortfolio[] {
  return _readLocal();
}

export function createLocalPortfolio(name: string): LocalPortfolio {
  const list = _readLocal();
  if (list.length >= 3) throw new Error("포트폴리오는 최대 3개까지 생성할 수 있습니다.");
  const now = new Date().toISOString();
  const portfolio: LocalPortfolio = {
    id: Date.now(),
    name,
    holdings: [],
    created_at: now,
    updated_at: now,
  };
  list.push(portfolio);
  _writeLocal(list);
  return portfolio;
}

export function deleteLocalPortfolio(id: number) {
  const list = _readLocal().filter((p) => p.id !== id);
  _writeLocal(list);
}

export function getLocalHoldings(portfolioId: number): LocalHolding[] {
  const list = _readLocal();
  const p = list.find((x) => x.id === portfolioId);
  return p ? p.holdings : [];
}

export function addLocalHolding(
  portfolioId: number,
  data: { ticker: string; name: string; market: string; quantity: number; avg_buy_price: number; currency: string },
): LocalHolding {
  const list = _readLocal();
  const p = list.find((x) => x.id === portfolioId);
  if (!p) throw new Error("포트폴리오를 찾을 수 없습니다.");

  // UPSERT: same ticker -> update
  const existing = p.holdings.find((h) => h.ticker === data.ticker);
  if (existing) {
    existing.quantity = data.quantity;
    existing.avg_buy_price = data.avg_buy_price;
    existing.name = data.name;
    existing.market = data.market;
    existing.currency = data.currency;
    p.updated_at = new Date().toISOString();
    _writeLocal(list);
    return existing;
  }

  if (p.holdings.length >= 20) throw new Error("종목은 최대 20개까지 추가할 수 있습니다.");

  const holding: LocalHolding = {
    id: Date.now(),
    ...data,
    added_at: new Date().toISOString(),
  };
  p.holdings.push(holding);
  p.updated_at = new Date().toISOString();
  _writeLocal(list);
  return holding;
}

export function deleteLocalHolding(portfolioId: number, holdingId: number) {
  const list = _readLocal();
  const p = list.find((x) => x.id === portfolioId);
  if (!p) return;
  p.holdings = p.holdings.filter((h) => h.id !== holdingId);
  p.updated_at = new Date().toISOString();
  _writeLocal(list);
}

// --- Storage Adapter (mode-branching) ---

export async function getPortfolios(): Promise<Portfolio[]> {
  if (isLocalMode()) {
    return getLocalPortfolios().map((p) => ({
      id: p.id,
      name: p.name,
      holding_count: p.holdings.length,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }));
  }
  return fetchPortfolios();
}

export async function createPortfolioAdapter(name: string): Promise<{ id: number; name: string; created_at: string | null }> {
  if (isLocalMode()) {
    const p = createLocalPortfolio(name);
    return { id: p.id, name: p.name, created_at: p.created_at };
  }
  return createPortfolio(name);
}

export async function deletePortfolioAdapter(id: number): Promise<void> {
  if (isLocalMode()) {
    deleteLocalPortfolio(id);
    return;
  }
  await deletePortfolio(id);
}

export async function getHoldings(portfolioId: number): Promise<PortfolioHolding[]> {
  if (isLocalMode()) {
    const localHoldings = getLocalHoldings(portfolioId);
    if (localHoldings.length === 0) return [];
    // Enrich with current prices from backend
    try {
      const enriched = await enrichHoldings(
        localHoldings.map((h) => ({
          ticker: h.ticker,
          name: h.name,
          market: h.market,
          quantity: h.quantity,
          avg_buy_price: h.avg_buy_price,
          currency: h.currency,
        })),
      );
      // Merge local IDs into enriched data
      return enriched.map((e: PortfolioHolding, i: number) => ({
        ...e,
        id: localHoldings[i]?.id ?? e.id,
        added_at: localHoldings[i]?.added_at ?? e.added_at,
      }));
    } catch {
      // Fallback: return local data without current prices
      return localHoldings.map((h) => ({
        id: h.id,
        ticker: h.ticker,
        name: h.name,
        market: h.market,
        quantity: h.quantity,
        avg_buy_price: h.avg_buy_price,
        currency: h.currency,
        current_price: h.avg_buy_price,
        exchange_rate: null,
        invested: h.quantity * h.avg_buy_price,
        eval_amount: h.quantity * h.avg_buy_price,
        pnl: 0,
        pnl_pct: 0,
        added_at: h.added_at,
      }));
    }
  }
  return fetchPortfolioHoldings(portfolioId);
}

export async function addHoldingAdapter(
  portfolioId: number,
  data: { ticker: string; name: string; market: string; quantity: number; avg_buy_price: number; currency: string },
): Promise<{ id: number; ticker: string; name: string; updated: boolean }> {
  if (isLocalMode()) {
    const existing = getLocalHoldings(portfolioId).find((h) => h.ticker === data.ticker);
    const h = addLocalHolding(portfolioId, data);
    return { id: h.id, ticker: h.ticker, name: h.name, updated: !!existing };
  }
  return addPortfolioHolding(portfolioId, data);
}

export async function deleteHoldingAdapter(portfolioId: number, holdingId: number): Promise<void> {
  if (isLocalMode()) {
    deleteLocalHolding(portfolioId, holdingId);
    return;
  }
  await deletePortfolioHolding(portfolioId, holdingId);
}

export async function generateReportAdapter(
  portfolioId: number,
  holdings: PortfolioHolding[],
): Promise<{ success: boolean; data: any; cached: boolean }> {
  if (isLocalMode()) {
    // Adhoc report: send holdings body
    return generateAdhocReport(
      holdings.map((h) => ({
        ticker: h.ticker,
        name: h.name,
        market: h.market,
        quantity: h.quantity,
        avg_buy_price: h.avg_buy_price,
        currency: h.currency,
      })),
    );
  }
  return generatePortfolioReport(portfolioId);
}

export async function fetchReportAdapter(
  portfolioId: number,
): Promise<{ success: boolean; data?: any; cached?: boolean; message?: string }> {
  if (isLocalMode()) {
    // No cache for local mode
    return { success: false, message: "로컬 모드에서는 캐시된 리포트가 없습니다." };
  }
  return fetchPortfolioReport(portfolioId);
}

// --- Migration: local -> server ---

export async function migrateLocalToServer(): Promise<{ migrated: number; failed: number }> {
  const localPortfolios = getLocalPortfolios();
  if (localPortfolios.length === 0) return { migrated: 0, failed: 0 };

  let migrated = 0;
  let failed = 0;

  for (const lp of localPortfolios) {
    try {
      const created = await createPortfolio(lp.name);
      for (const h of lp.holdings) {
        try {
          await addPortfolioHolding(created.id, {
            ticker: h.ticker,
            name: h.name,
            market: h.market,
            quantity: h.quantity,
            avg_buy_price: h.avg_buy_price,
            currency: h.currency,
          });
        } catch {
          failed++;
        }
      }
      migrated++;
    } catch {
      failed++;
    }
  }

  // Clear local data on success
  if (migrated > 0) {
    localStorage.removeItem(LOCAL_PORTFOLIOS_KEY);
  }
  return { migrated, failed };
}

export function hasLocalData(): boolean {
  return getLocalPortfolios().length > 0;
}

export function isLoggedIn(): boolean {
  return !!getAccessToken();
}
