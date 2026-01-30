import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.temple-era.com";

  // Check if we're on Vercel and not in production
  const vercelEnv = process.env.VERCEL_ENV;
  const isProduction =
    vercelEnv === "production" || baseUrl.includes("temple-era.com");

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
      allow: ["/", "/raids", "/raids/*", "/rare-recipes"],
      disallow: [
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
