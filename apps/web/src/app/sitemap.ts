import { type MetadataRoute } from "next";
import { db } from "~/server/db";
import { raids } from "~/server/db/schema";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.temple-era.com";

  // Fetch all raids for dynamic sitemap
  let recentRaids: { id: number; date: string | null }[] = [];
  try {
    const allRaids = await db.select({ id: raids.raidId, date: raids.date }).from(raids);
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    recentRaids = allRaids.filter((raid) => raid.date && new Date(raid.date) > sixMonthsAgo);
  } catch {
    // DB unavailable during build — return static pages only
  }

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

  const raidPages = recentRaids.map((raid) => ({
    url: `${baseUrl}/raids/${raid.id}`,
    lastModified: raid.date ? new Date(raid.date) : new Date(),
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...raidPages];
}
