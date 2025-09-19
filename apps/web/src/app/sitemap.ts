import { type MetadataRoute } from "next";
import { db } from "~/server/db";
import { raids } from "~/server/db/schema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.templeashkandi.com";

  // Fetch all raids for dynamic sitemap
  const allRaids = await db
    .select({ id: raids.raidId, date: raids.date })
    .from(raids);

  // Filter to only include raids from the last 6 months
  const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
  const recentRaids = allRaids.filter(
    (raid) => raid.date && new Date(raid.date) > sixMonthsAgo,
  );

  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/raids`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/rare-recipes`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
  ];

  // Add individual raid pages for recent raids only
  const raidPages = recentRaids.map((raid) => ({
    url: `${baseUrl}/raids/${raid.id}`,
    lastModified: raid.date ? new Date(raid.date) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...raidPages];
}
