import { db } from "~/server/db";
import {
  raids,
  characters,
  raidLogs,
  raidLogAttendeeMap,
  raidBenchMap,
  users,
  recipes,
  characterRecipeMap,
} from "~/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function getRaidMetadata(raidId: number) {
  try {
    const raidResult = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        date: raids.date,
        zone: raids.zone,
        attendanceWeight: raids.attendanceWeight,
        createdById: raids.createdById,
      })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    return raidResult[0] || null;
  } catch (error) {
    console.error("Error fetching raid metadata:", error);
    return null;
  }
}

export async function getRaidMetadataWithStats(raidId: number) {
  try {
    // Get basic raid info
    const raidResult = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        date: raids.date,
        zone: raids.zone,
        attendanceWeight: raids.attendanceWeight,
        createdById: raids.createdById,
      })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    if (!raidResult[0]) return null;

    const raid = raidResult[0];

    // Get associated raid logs with participant counts and kills
    const raidLogsResult = await db
      .select({
        raidLogId: raidLogs.raidLogId,
        name: raidLogs.name,
        kills: raidLogs.kills,
        startTimeUTC: raidLogs.startTimeUTC,
        endTimeUTC: raidLogs.endTimeUTC,
        participantCount: sql<number>`count(${raidLogAttendeeMap.characterId})`,
      })
      .from(raidLogs)
      .leftJoin(
        raidLogAttendeeMap,
        eq(raidLogs.raidLogId, raidLogAttendeeMap.raidLogId),
      )
      .where(eq(raidLogs.raidId, raidId))
      .groupBy(
        raidLogs.raidLogId,
        raidLogs.name,
        raidLogs.kills,
        raidLogs.startTimeUTC,
        raidLogs.endTimeUTC,
      );

    // Get bench count
    const benchResult = await db
      .select({
        benchCount: sql<number>`count(${raidBenchMap.characterId})`,
      })
      .from(raidBenchMap)
      .where(eq(raidBenchMap.raidId, raidId));

    // Get participant class data for composition
    const participantClassesResult = await db
      .select({
        class: characters.class,
        classCount: sql<number>`count(${characters.characterId})`,
      })
      .from(raidLogs)
      .leftJoin(
        raidLogAttendeeMap,
        eq(raidLogs.raidLogId, raidLogAttendeeMap.raidLogId),
      )
      .leftJoin(
        characters,
        eq(raidLogAttendeeMap.characterId, characters.characterId),
      )
      .where(eq(raidLogs.raidId, raidId))
      .groupBy(characters.class);

    // Get creator info
    const creatorResult = raid.createdById
      ? await db
          .select({
            name: users.name,
          })
          .from(users)
          .where(eq(users.id, raid.createdById))
          .limit(1)
      : [];

    // Aggregate data
    const allKills = raidLogsResult.flatMap((log) => log.kills);
    const uniqueKills = [...new Set(allKills)];
    const totalParticipants = raidLogsResult.reduce(
      (sum, log) => sum + Number(log.participantCount),
      0,
    );
    const benchCount = Number(benchResult[0]?.benchCount) || 0;

    return {
      ...raid,
      creator: creatorResult[0]?.name || null,
      raidLogs: raidLogsResult,
      totalParticipants,
      benchCount,
      totalKills: uniqueKills.length,
      kills: uniqueKills,
      raidLogCount: raidLogsResult.length,
      participantClasses: participantClassesResult,
    };
  } catch (error) {
    console.error("Error fetching raid metadata with stats:", error);
    return null;
  }
}

export async function getCharacterMetadata(characterId: number) {
  try {
    const characterResult = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
      })
      .from(characters)
      .where(eq(characters.characterId, characterId))
      .limit(1);

    return characterResult[0] || null;
  } catch (error) {
    console.error("Error fetching character metadata:", error);
    return null;
  }
}

export async function getCharacterMetadataWithStats(characterId: number) {
  try {
    // Get basic character info
    const characterResult = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
        slug: characters.slug,
        classDetail: characters.classDetail,
        isPrimary: characters.isPrimary,
        primaryCharacterId: characters.primaryCharacterId,
      })
      .from(characters)
      .where(eq(characters.characterId, characterId))
      .limit(1);

    if (!characterResult[0]) return null;

    const character = characterResult[0];

    // Get raid attendance statistics - separate queries to avoid cartesian products
    const attendedRaidsResult = await db
      .select({
        attendedRaids: sql<number>`count(distinct ${raids.raidId})`,
      })
      .from(raids)
      .leftJoin(raidLogs, eq(raids.raidId, raidLogs.raidId))
      .leftJoin(
        raidLogAttendeeMap,
        eq(raidLogs.raidLogId, raidLogAttendeeMap.raidLogId),
      )
      .where(eq(raidLogAttendeeMap.characterId, characterId));

    const benchedRaidsResult = await db
      .select({
        benchedRaids: sql<number>`count(distinct ${raids.raidId})`,
      })
      .from(raids)
      .leftJoin(raidBenchMap, eq(raids.raidId, raidBenchMap.raidId))
      .where(eq(raidBenchMap.characterId, characterId));

    const attendanceStats = {
      attendedRaids: Number(attendedRaidsResult[0]?.attendedRaids) || 0,
      benchedRaids: Number(benchedRaidsResult[0]?.benchedRaids) || 0,
    };

    // Get raid zones and recent activity - combine attended and benched raids
    const attendedRaids = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        zone: raids.zone,
        date: raids.date,
        attendanceWeight: raids.attendanceWeight,
        isAttendee: sql<boolean>`true`,
        isBenched: sql<boolean>`false`,
      })
      .from(raids)
      .leftJoin(raidLogs, eq(raids.raidId, raidLogs.raidId))
      .leftJoin(
        raidLogAttendeeMap,
        eq(raidLogs.raidLogId, raidLogAttendeeMap.raidLogId),
      )
      .where(eq(raidLogAttendeeMap.characterId, characterId));

    const benchedRaids = await db
      .select({
        raidId: raids.raidId,
        name: raids.name,
        zone: raids.zone,
        date: raids.date,
        attendanceWeight: raids.attendanceWeight,
        isAttendee: sql<boolean>`false`,
        isBenched: sql<boolean>`true`,
      })
      .from(raids)
      .leftJoin(raidBenchMap, eq(raids.raidId, raidBenchMap.raidId))
      .where(eq(raidBenchMap.characterId, characterId));

    // Combine and sort all raids
    const allRaids = [...attendedRaids, ...benchedRaids]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);

    // Get zones from combined raids
    const raidZones = allRaids.reduce((acc: any, raid) => {
      if (!acc[raid.zone]) {
        acc[raid.zone] = {
          zone: raid.zone,
          raidCount: 0,
          latestRaidDate: raid.date,
        };
      }
      acc[raid.zone].raidCount++;
      if (new Date(raid.date) > new Date(acc[raid.zone].latestRaidDate)) {
        acc[raid.zone].latestRaidDate = raid.date;
      }
      return acc;
    }, {});

    const recentRaids = allRaids;

    // Get secondary characters if this is a primary character
    const secondaryCharacters = character.isPrimary
      ? await db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            class: characters.class,
          })
          .from(characters)
          .where(eq(characters.primaryCharacterId, characterId))
      : [];

    // Get character's recipes by profession
    const characterRecipes = await db
      .select({
        profession: recipes.profession,
        recipeCount: sql<number>`count(${recipes.recipeSpellId})`,
      })
      .from(recipes)
      .innerJoin(
        characterRecipeMap,
        eq(recipes.recipeSpellId, characterRecipeMap.recipeSpellId),
      )
      .where(eq(characterRecipeMap.characterId, characterId))
      .groupBy(recipes.profession);

    return {
      ...character,
      attendanceStats: attendanceStats,
      raidZones: Object.values(raidZones),
      recentRaids: recentRaids,
      secondaryCharacters: secondaryCharacters,
      characterRecipes: characterRecipes,
    };
  } catch (error) {
    console.error("Error fetching character metadata with stats:", error);
    return null;
  }
}

// Breadcrumb-specific helpers that return just the name for breadcrumb display
export async function getRaidBreadcrumbName(
  raidId: number,
): Promise<string | null> {
  try {
    const raidResult = await db
      .select({
        name: raids.name,
      })
      .from(raids)
      .where(eq(raids.raidId, raidId))
      .limit(1);

    return raidResult[0]?.name || null;
  } catch (error) {
    console.error("Error fetching raid breadcrumb name:", error);
    return null;
  }
}

export async function getCharacterBreadcrumbName(
  characterId: number,
): Promise<string | null> {
  try {
    const characterResult = await db
      .select({
        name: characters.name,
      })
      .from(characters)
      .where(eq(characters.characterId, characterId))
      .limit(1);

    return characterResult[0]?.name || null;
  } catch (error) {
    console.error("Error fetching character breadcrumb name:", error);
    return null;
  }
}

// Helper function to get expected boss count for each zone
function getExpectedBossCount(zone: string): number {
  const bossCounts: Record<string, number> = {
    "Molten Core": 10,
    "Blackwing Lair": 8,
    "Temple of Ahn'Qiraj": 9,
    Naxxramas: 15,
    "Onyxia's Lair": 1,
    "Zul'Gurub": 9,
    "Ruins of Ahn'Qiraj": 6,
    "Blackrock Depths": 5,
    Stratholme: 4,
    Scholomance: 4,
    "Dire Maul": 3,
    "Blackrock Spire": 2,
  };
  return bossCounts[zone] || 0;
}

// Helper function to get class composition
function getClassComposition(raidData: any): string {
  if (!raidData.participantClasses || raidData.participantClasses.length === 0)
    return "";

  // Sort classes by count (descending) and include all present classes
  const sortedClasses = raidData.participantClasses
    .filter((pc: any) => pc.class && pc.classCount > 0)
    .sort((a: any, b: any) => Number(b.classCount) - Number(a.classCount));

  if (sortedClasses.length === 0) return "";

  // Format as "X Warriors, Y Mages, Z Priests, etc."
  const classStrings = sortedClasses.map(
    (pc: any) =>
      `${Number(pc.classCount)} ${pc.class}${Number(pc.classCount) > 1 ? "s" : ""}`,
  );

  return classStrings.join(", ");
}

// Helper function to generate story-like character descriptions
function generateCharacterStoryDescription(characterData: any): string {
  if (!characterData) return "Character details unavailable";

  const {
    name,
    class: characterClass,
    attendanceStats,
    recentRaids,
    secondaryCharacters,
    characterRecipes,
  } = characterData;

  // Build the character's story
  let story = `${name} (${characterClass})`;

  // Add attendance statistics
  const attendedRaids = Number(attendanceStats?.attendedRaids) || 0;
  const benchedRaids = Number(attendanceStats?.benchedRaids) || 0;
  const totalRaids = attendedRaids + benchedRaids;

  if (totalRaids > 0) {
    story += ` has participated in ${totalRaids} total raids - ${attendedRaids} attended, ${benchedRaids} on bench`;

    // Add recent activity to the same sentence
    if (recentRaids && recentRaids.length > 0) {
      const latestRaid = recentRaids[0];
      // Treat the date as a local date without timezone conversion to avoid day shifts
      const latestDate = new Date(latestRaid.date + "T00:00:00");
      const friendlyDate = latestDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      story += `, and most recently ${latestRaid.zone} (${latestRaid.name}) on ${friendlyDate}`;
    }
  } else {
    story += ` who has not yet participated in any tracked raids`;
  }

  // Add recipe information
  if (characterRecipes && characterRecipes.length > 0) {
    const totalRecipes = characterRecipes.reduce(
      (sum: number, recipe: any) => sum + Number(recipe.recipeCount),
      0,
    );
    const professionCount = characterRecipes.length;
    const professionNames = characterRecipes.map((recipe: any) =>
      recipe.profession.toLowerCase(),
    );

    let professionText = "";
    if (professionCount === 1) {
      const recipeCount = Number(characterRecipes[0].recipeCount);
      professionText = `${recipeCount} ${professionNames[0]} recipe${recipeCount > 1 ? "s" : ""}`;
    } else if (professionCount === 2) {
      professionText = `${professionNames[0]} and ${professionNames[1]}`;
    } else {
      const lastProfession = professionNames.pop();
      professionText = `${professionNames.join(", ")}, and ${lastProfession}`;
    }

    if (professionCount === 1) {
      story += `. They know ${professionText}`;
    } else {
      story += `. They know ${totalRecipes} recipe${totalRecipes > 1 ? "s" : ""} across ${professionText}`;
    }
  }

  // Add secondary characters information
  if (secondaryCharacters && secondaryCharacters.length > 0) {
    const altNames = secondaryCharacters
      .map((alt: any) => `${alt.name} (${alt.class})`)
      .join(", ");
    story += `. Also plays ${altNames}`;
  }

  story += ".";

  return story;
}

// Helper function to generate story-like raid descriptions
function generateRaidStoryDescription(raidData: any): string {
  if (!raidData) return "Raid details unavailable";

  // Treat the date as a local date without timezone conversion to avoid day shifts
  const raidDate = new Date(raidData.date + "T00:00:00");
  const friendlyDate = raidDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Get raid time from logs
  let raidTime = "";
  if (raidData.raidLogs && raidData.raidLogs.length > 0) {
    const startTimes = raidData.raidLogs
      .map((log: any) => log.startTimeUTC)
      .filter(Boolean);
    if (startTimes.length > 0) {
      const earliestStart = new Date(
        Math.min(...startTimes.map((t: any) => new Date(t).getTime())),
      );
      raidTime = ` at ${earliestStart.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "America/New_York", // Proper ET timezone handling
      })}`;
    }
  }

  // Get participant counts (ensure they're numbers)
  const attendedCount = Number(raidData.totalParticipants) || 0;

  // Get boss kills (reverse order - latest first)
  const allKills = raidData.kills || [];
  const recentKills = allKills.slice(-3).reverse(); // Last 3 kills, reversed
  const additionalKills = Math.max(0, allKills.length - 3);

  // Calculate completion count
  const expectedBosses = getExpectedBossCount(raidData.zone);
  const completionText =
    expectedBosses > 0
      ? `${allKills.length} of ${expectedBosses}`
      : `${allKills.length} bosses`;

  // Calculate raid duration
  let durationText = "";
  if (raidData.raidLogs && raidData.raidLogs.length > 0) {
    const startTimes = raidData.raidLogs
      .map((log: any) => log.startTimeUTC)
      .filter(Boolean);
    const endTimes = raidData.raidLogs
      .map((log: any) => log.endTimeUTC)
      .filter(Boolean);

    if (startTimes.length > 0 && endTimes.length > 0) {
      const earliestStart = new Date(
        Math.min(...startTimes.map((t: any) => new Date(t).getTime())),
      );
      const latestEnd = new Date(
        Math.max(...endTimes.map((t: any) => new Date(t).getTime())),
      );
      const durationMs = latestEnd.getTime() - earliestStart.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      const roundedMinutes = Math.round(durationMinutes / 10) * 10;
      durationText = ` in ~${roundedMinutes} minutes`;
    }
  }

  // Get class composition
  const classComposition = getClassComposition(raidData);

  // Build the story
  let story = `On ${friendlyDate}${raidTime}, ${attendedCount} raiders descended on ${raidData.zone || "Unknown Zone"}`;

  if (allKills.length > 0) {
    story += ` killing ${recentKills.join(", ")}`;
    if (additionalKills > 0) {
      story += `, and ${additionalKills} other${additionalKills > 1 ? "s" : ""}`;
    }
    story += ` (${completionText})`;
  } else {
    story += ` (no bosses defeated)`;
  }

  story += durationText;

  // Add class composition with dash separator if present
  if (classComposition) {
    story += " - " + classComposition;
  }

  story += ".";

  return story;
}

// Shared metadata generation functions
export function generateRaidMetadata(raidData: any, raidId: number) {
  if (!raidData) {
    return {
      title: `Temple Raid Attendance - Raids - ${raidId}`,
      description: `Raid details for raid ${raidId}`,
    };
  }

  // Build enhanced title
  const title = `Temple Raid Attendance - ${raidData.name}${raidData.zone ? ` (${raidData.zone})` : ""}`;

  // Build story-like description
  const description = generateRaidStoryDescription(raidData);

  // Build Open Graph data
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.templeashkandi.com";
  const openGraph = {
    title,
    description,
    type: "website" as const,
    url: `${baseUrl}/raids/${raidId}`,
    siteName: "Temple Raid Attendance",
  };

  // Build structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: raidData.name,
    description: description,
    startDate: raidData.date,
    location: {
      "@type": "Place",
      name: raidData.zone,
    },
    organizer: raidData.creator
      ? {
          "@type": "Person",
          name: raidData.creator,
        }
      : undefined,
    ...(raidData.totalKills > 0 && {
      eventStatus: "https://schema.org/EventScheduled",
    }),
  };

  return {
    title,
    description,
    openGraph,
    structuredData,
  };
}

export function generateCharacterMetadata(
  characterData: any,
  characterId: number,
) {
  if (!characterData) {
    return {
      title: `Temple Raid Attendance - Characters - ${characterId}`,
      description: `Character details for character ${characterId}`,
    };
  }

  // Build enhanced title
  const title = `Temple Raid Attendance - ${characterData.name}${characterData.class ? ` (${characterData.class})` : ""}`;

  // Build story-like description
  const description = generateCharacterStoryDescription(characterData);

  // Build Open Graph data
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://www.templeashkandi.com";
  const openGraph = {
    title,
    description,
    type: "profile" as const,
    url: `${baseUrl}/characters/${characterId}`,
    siteName: "Temple Raid Attendance",
  };

  // Build structured data for SEO
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: characterData.name,
    description: description,
    ...(characterData.class && {
      jobTitle: characterData.class,
    }),
    ...(characterData.server && {
      affiliation: {
        "@type": "Organization",
        name: characterData.server,
      },
    }),
  };

  return {
    title,
    description,
    openGraph,
    structuredData,
  };
}
