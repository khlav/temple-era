import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans } from "~/server/db/schema";
import { inArray } from "drizzle-orm";
import { inferTalentRole } from "~/lib/class-specs";
import { env } from "~/env";
import { formatInTimeZone } from "date-fns-tz";

const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

const WOW_CLASSES = new Set([
  "druid",
  "hunter",
  "mage",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
]);
const SKIP_CLASS_NAMES = new Set([
  "bench",
  "tentative",
  "absent",
  "absence",
  "late",
]);
const TANK_SPEC_TO_CLASS: Record<string, string> = {
  guardian: "Druid",
  protection: "Warrior",
};

function resolveClassName(className: string, specName?: string): string | null {
  const lc = className.toLowerCase();
  if (SKIP_CLASS_NAMES.has(lc)) return null;
  if (WOW_CLASSES.has(lc)) return lc.charAt(0).toUpperCase() + lc.slice(1);
  if (lc === "tank" && specName)
    return TANK_SPEC_TO_CLASS[specName.toLowerCase()] ?? null;
  return null;
}

function resolveEventTitle(title: string, startTime: number): string {
  return title.replace(/\{eventtime#([^}]+)\}/gi, (_, fmt: string) => {
    const date = new Date(startTime * 1000);
    const dateFnsFormat = fmt.replace(/E(?!E)/g, "EEE").replace(/a/g, "aaa");
    try {
      return formatInTimeZone(date, "America/New_York", dateFnsFormat);
    } catch {
      return `{eventtime#${fmt}}`;
    }
  });
}

interface PostedEvent {
  id: string;
  title: string;
  channelName?: string;
  startTime: number;
  signUpCount?: number | string;
  channelId: string;
}
interface PostedEventsResponse {
  postedEvents: PostedEvent[];
}
interface RaidHelperSignup {
  className: string;
  specName: string;
}
interface RaidHelperEventResponse {
  signUps?: RaidHelperSignup[];
}

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawHoursBack = Number(searchParams.get("hoursBack") ?? "0");
    const hoursBack = Math.max(0, isNaN(rawHoursBack) ? 0 : rawHoursBack);

    const listRes = await fetch(
      `${RAID_HELPER_API_BASE}/v4/servers/${env.DISCORD_SERVER_ID}/events`,
      { headers: { Authorization: env.RAID_HELPER_API_KEY } },
    );

    if (listRes.status === 404) {
      return NextResponse.json([]);
    }

    if (!listRes.ok) {
      return NextResponse.json(
        { error: "Raid Helper API unavailable" },
        { status: 502 },
      );
    }

    const listData = (await listRes.json()) as PostedEventsResponse;
    const secondsPerHour = 3600;
    const minStartTime =
      Math.floor(Date.now() / 1000) - secondsPerHour * hoursBack;

    const filtered = (listData.postedEvents ?? [])
      .filter((e) => e.startTime >= minStartTime)
      .sort((a, b) => a.startTime - b.startTime);

    const eventsWithRoles = await Promise.all(
      filtered.map(async (e) => {
        const roleCounts = { Tank: 0, Healer: 0, Melee: 0, Ranged: 0 };
        try {
          const detailRes = await fetch(
            `${RAID_HELPER_API_BASE}/v4/events/${e.id}`,
            { headers: { Authorization: env.RAID_HELPER_API_KEY } },
          );
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as RaidHelperEventResponse;
            for (const signup of detail.signUps ?? []) {
              const specName = signup.specName?.replace(/[0-9]/g, "") ?? "";
              const resolvedClass = resolveClassName(
                signup.className,
                specName,
              );
              if (!resolvedClass) continue;
              const role = inferTalentRole(resolvedClass, specName);
              if (role in roleCounts)
                roleCounts[role as keyof typeof roleCounts]++;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch details for event ${e.id}`, err);
        }
        return {
          id: e.id,
          title: e.title,
          displayTitle: resolveEventTitle(e.title, e.startTime),
          startTime: e.startTime,
          signUpCount:
            typeof e.signUpCount === "string"
              ? Number(e.signUpCount)
              : (e.signUpCount ?? 0),
          roleCounts,
        };
      }),
    );

    const eventIds = eventsWithRoles.map((e) => e.id);
    const existingPlans =
      eventIds.length > 0
        ? await db
            .select({
              id: raidPlans.id,
              raidHelperEventId: raidPlans.raidHelperEventId,
              updatedAt: raidPlans.updatedAt,
              createdAt: raidPlans.createdAt,
            })
            .from(raidPlans)
            .where(inArray(raidPlans.raidHelperEventId, eventIds))
        : [];

    const planMap = new Map(
      existingPlans.map((p) => [
        p.raidHelperEventId,
        {
          id: p.id,
          lastModifiedAt: new Date(p.updatedAt ?? p.createdAt).toISOString(),
        },
      ]),
    );

    return NextResponse.json(
      eventsWithRoles.map((e) => ({
        ...e,
        existingPlan: planMap.get(e.id) ?? null,
      })),
    );
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
