/**
 * 시장(market)에 따라 가격에 통화 기호를 붙여 포맷합니다.
 * - US (NYSE/NASDAQ): $1,234.56
 * - KR (KOSPI/KOSDAQ 등): 1,234원
 */
export function formatPrice(price: number | null | undefined, market?: string): string {
  if (price == null || price === 0) return "-";
  const isUS = market ? ["NYSE", "NASDAQ", "AMEX"].includes(market) || market.startsWith("Nasdaq") : false;
  if (isUS) {
    return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (price >= 1000) return `${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}원`;
  return `${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}원`;
}
