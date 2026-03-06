import type { MetadataRoute } from "next";

const BASE_URL = "https://traderadars.com";

// 인기 종목 (KR 30 + US 20)
const POPULAR_KR = [
  "005930", "000660", "035420", "035720", "051910",
  "006400", "028260", "003670", "105560", "055550",
  "012330", "066570", "096770", "034730", "003490",
  "015760", "033780", "009150", "018260", "032830",
  "086790", "011200", "010130", "024110", "017670",
  "030200", "000270", "036570", "034020", "009540",
];

const POPULAR_US = [
  "AAPL", "MSFT", "GOOGL", "AMZN", "NVDA",
  "META", "TSLA", "BRK-B", "UNH", "JNJ",
  "V", "JPM", "PG", "MA", "HD",
  "AVGO", "LLY", "MRK", "COST", "ABBV",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/recommendations`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/news`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/fundamental`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/community`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/backtest`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];

  // 인기 종목 분석 페이지
  for (const ticker of [...POPULAR_KR, ...POPULAR_US]) {
    pages.push({
      url: `${BASE_URL}/analysis/${ticker}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    });
  }

  return pages;
}
