import type { MetadataRoute } from "next";

const BASE_URL = "https://traderadars.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    { url: BASE_URL, lastModified: now, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE_URL}/search`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/recommendations`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/news`, lastModified: now, changeFrequency: "hourly", priority: 0.8 },
    { url: `${BASE_URL}/fundamental`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${BASE_URL}/community`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/backtest`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
  ];
}
