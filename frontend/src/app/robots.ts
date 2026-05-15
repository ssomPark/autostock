import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/admin",
          "/pipeline",
          "/my-analyses",
          "/paper-trading",
          "/portfolio",
          "/profile",
          "/compare",
        ],
      },
    ],
    sitemap: "https://traderadars.com/sitemap.xml",
  };
}
