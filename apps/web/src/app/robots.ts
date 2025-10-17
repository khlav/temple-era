import { type MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.templeashkandi.com";

  // Block all crawling on non-production deployments
  if (!baseUrl.includes("templeashkandi.com")) {
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
