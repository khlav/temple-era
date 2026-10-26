import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.temple-era.com";

  // Check if we're on Vercel and not in production
  const vercelEnv = process.env.VERCEL_ENV;
  const isProduction = vercelEnv === "production" || baseUrl.includes("temple-era.com");

  // Block all crawling on non-production deployments (preview, development)
  if (!isProduction) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  // Production rules
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/raids", "/rare-recipes"],
      disallow: [
        // Individual raid pages. About 80% of their renders were crawlers (AI-training and
        // search bots alike), the largest source of database egress (TEMPLE-158). "/raids/"
        // leaves the /raids list itself crawlable. Never add "/raids/*" to allow: the longer
        // rule wins, so it would override this.
        "/raids/",
        "/characters",
        "/characters/*",
        "/admin/",
        "/raid-manager/",
        "/profile",
        "/api/",
        "/_next/",
        "/favicon/",
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
