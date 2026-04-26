import { z } from "zod";
import {
  sql,
  eq,
  or,
  inArray,
  and,
  notInArray,
  isNotNull,
  desc,
  aliasedTable,
} from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import {
  createTRPCRouter,
  publicProcedure,
  raidManagerProcedure,
} from "~/server/api/trpc";
import { CLASS_SPECS, inferTalentRole } from "~/lib/class-specs";
import { env } from "~/env";
import { TRPCError } from "@trpc/server";
import {
  characters,
  users,
  accounts,
  primaryRaidAttendeeAndBenchMap,
  trackedRaidsL6LockoutWk,
} from "~/server/db/schema";
import { getZoneForInstance } from "~/lib/raid-zones";
import {
  type MatchStatus,
  type MatchedCharacter,
  type SignupMatchResult,
  resolveClassName,
  matchSignupsToCharacters as matchSignupsToCharactersHelper,
} from "~/server/api/helpers/match-signups";

// Re-export for backwards compatibility with existing component imports
export type { MatchStatus, MatchedCharacter, SignupMatchResult };

const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

/**
 * Resolve Raid-Helper title templates like "Naxx {eventtime#E MM/dd}"
 * Converts the {eventtime#FORMAT} placeholder to actual date using startTime
 */
function resolveEventTitle(title: string, startTime: number): string {
  // Match {eventtime#FORMAT} pattern
  return title.replace(/\{eventtime#([^}]+)\}/gi, (_, formatStr: string) => {
    const date = new Date(startTime * 1000);
    // Convert Raid-Helper format to date-fns format
    // Common patterns: E = day abbrev, MM = month, dd = day, h:mm a = time
    const dateFnsFormat = formatStr
      .replace(/E(?!E)/g, "EEE") // E -> EEE (Mon, Tue, etc)
      .replace(/EEEE/g, "EEEE") // EEEE stays as EEEE (Monday, Tuesday)
      .replace(/a/g, "aaa"); // a -> aaa for am/pm
    try {
      return formatInTimeZone(date, "America/New_York", dateFnsFormat);
    } catch {
      // If format fails, return original placeholder
      return `{eventtime#${formatStr}}`;
    }
  });
}

// Types for Raid-Helper API responses
interface PostedEvent {
  id: string;
  title: string;
  displayTitle?: string;
  channelName?: string;
  startTime: number;
  endTime: number;
  leaderName?: string;
  description?: string;
  imageUrl?: string;
  signUpCount?: number | string;
  softresId?: string;
  scheduledId?: string;
  channelId: string;
  color?: string;
  templateId?: string;
  leaderId?: string;
  lastUpdated?: number;
  closeTime?: number;
}

interface PostedEventsResponse {
  pages?: number;
  eventsOverall?: number;
  eventsTransmitted?: number;
  currentPage?: number;
  postedEvents: PostedEvent[];
}

interface RaidHelperSignup {
  userId: string;
  name: string;
  className: string;
  specName: string;
  roleName: string;
  status: string;
  position: number;
  entryTime: number;
}

interface RaidHelperEventResponse {
  id: string;
  title: string;
  displayTitle: string;
  description: string;
  date: string;
  time: string;
  startTime: number;
  endTime: number;
  signUps: RaidHelperSignup[];
  leaderId: string;
  leaderName: string;
  channelName: string;
  channelId?: string;
  serverId?: string;
  softresId?: string;
  scheduledId?: string;
  classes?: Array<{
    name: string;
    type?: string;
    effectiveName?: string;
    limit?: number;
    emoteId?: string;
    specs?: Array<{
      name: string;
      roleName?: string;
      roleEmoteId?: string;
      limit?: number;
      emoteId?: string;
      color?: string;
    }>;
  }>;
  roles?: Array<{
    name: string;
    limit?: number;
    emoteId?: string;
  }>;
  lastUpdated?: number;
  closingTime?: number;
}

interface RaidPlanSlot {
  groupNumber: number;
  slotNumber: number;
  name: string | null;
  id: string | null;
  className: string | null;
  specName: string | null;
  color: string | null;
  isConfirmed?: string;
}

interface RaidPlanGroup {
  name: string;
  position: number;
}

interface RaidHelperPlanResponse {
  slots: RaidPlanSlot[];
  groups: RaidPlanGroup[];
  groupCount?: number;
  slotCount?: number;
  showRoles?: boolean;
  editPermissions?: string;
}

export const raidHelperRouter = createTRPCRouter({
  /**
   * Fetch scheduled events from the Discord server
   */
  getScheduledEvents: publicProcedure
    .input(
      z.object({
        allowableHoursPastStart: z.number().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const session = await ctx.getSession();
      const response = await fetch(
        `${RAID_HELPER_API_BASE}/v4/servers/${env.DISCORD_SERVER_ID}/events`,
        {
          headers: {
            Authorization: env.RAID_HELPER_API_KEY,
          },
        },
      );

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch scheduled events: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as PostedEventsResponse;

      // Fetch Discord ID for the current user if authenticated
      let userDiscordId: string | null = null;
      if (session?.user?.id) {
        const account = await ctx.db.query.accounts.findFirst({
          where: (accounts, { eq, and }) =>
            and(
              eq(accounts.userId, session.user.id),
              eq(accounts.provider, "discord"),
            ),
          columns: {
            providerAccountId: true,
          },
        });
        userDiscordId = account?.providerAccountId ?? null;
      }

      const secondsPerHour = 3600;
      const minStartTime =
        Math.floor(Date.now() / 1000) -
        secondsPerHour * input.allowableHoursPastStart;

      // Filter to events newer than 1 hour ago and sort by startTime ascending
      const filteredEvents = data.postedEvents
        .filter((e) => e.startTime >= minStartTime)
        .sort((a, b) => a.startTime - b.startTime);

      // Fetch details for each event to get role counts
      const eventsWithRoles = await Promise.all(
        filteredEvents.map(async (e) => {
          let roleCounts = {
            Tank: 0,
            Healer: 0,
            Melee: 0,
            Ranged: 0,
          };
          let userSignupStatus: string | null = null;

          try {
            // Fetch event details to get signups
            const detailResponse = await fetch(
              `${RAID_HELPER_API_BASE}/v4/events/${e.id}`,
              {
                headers: {
                  Authorization: env.RAID_HELPER_API_KEY,
                },
              },
            );

            if (detailResponse.ok) {
              const detailData =
                (await detailResponse.json()) as RaidHelperEventResponse;
              const signUps = detailData.signUps ?? [];

              // Calculate role counts
              const counts = {
                Tank: 0,
                Healer: 0,
                Melee: 0,
                Ranged: 0,
              };

              for (const signup of signUps) {
                if (userDiscordId && signup.userId === userDiscordId) {
                  // Check if className indicates a special status
                  const specialStatuses = [
                    "Bench",
                    "Late",
                    "Tentative",
                    "Absence",
                    "Absent",
                  ];
                  if (specialStatuses.includes(signup.className)) {
                    userSignupStatus = signup.className;
                  } else {
                    userSignupStatus = "Confirmed";
                  }
                }

                // Clean specName by removing numbers (e.g., "Protection1" -> "Protection")
                const specName = signup.specName?.replace(/[0-9]/g, "") ?? "";
                const resolvedClass = resolveClassName(
                  signup.className,
                  specName,
                );

                if (!resolvedClass) {
                  continue;
                }

                // Use strict role inference for consistency with Find Gamers
                const role = inferTalentRole(resolvedClass, specName);
                if (counts[role] !== undefined) {
                  counts[role]++;
                }
              }
              roleCounts = counts;
            }
          } catch (err) {
            console.error(`Failed to fetch details for event ${e.id}`, err);
            // Default to 0 counts on error
          }

          return {
            id: e.id,
            title: e.title,
            displayTitle: resolveEventTitle(e.title, e.startTime),
            channelName: e.channelName ?? "",
            startTime: e.startTime,
            leaderName: e.leaderName ?? "",
            signUpCount:
              typeof e.signUpCount === "string"
                ? Number(e.signUpCount)
                : (e.signUpCount ?? 0),
            channelId: e.channelId,
            serverId: env.DISCORD_SERVER_ID,
            roleCounts,
            userSignupStatus,
          };
        }),
      );

      return eventsWithRoles;
    }),

  /**
   * Fetch event details including all signups and group assignments
   */
  getEventDetails: raidManagerProcedure
    .input(z.object({ eventId: z.string() }))
    .query(async ({ input }) => {
      // First, fetch the event/channel to check if we need to resolve lastEventId
      const initialResponse = await fetch(
        `${RAID_HELPER_API_BASE}/v4/events/${input.eventId}`,
        {
          headers: {
            Authorization: env.RAID_HELPER_API_KEY,
          },
        },
      );

      if (!initialResponse.ok) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Event not found: ${input.eventId}`,
        });
      }

      const initialData = (await initialResponse.json()) as Record<
        string,
        unknown
      >;

      // If this is a channel/scheduled event (no signUps), resolve to lastEventId
      const actualEventId =
        !initialData.signUps && initialData.lastEventId
          ? (initialData.lastEventId as string)
          : input.eventId;

      // Now fetch both event signups and raidplan with the correct event ID
      const [eventResponse, planResponse] = await Promise.all([
        actualEventId !== input.eventId
          ? fetch(`${RAID_HELPER_API_BASE}/v4/events/${actualEventId}`, {
              headers: {
                Authorization: env.RAID_HELPER_API_KEY,
              },
            })
          : Promise.resolve(initialResponse),
        fetch(`${RAID_HELPER_API_BASE}/v4/comps/${actualEventId}`, {
          headers: {
            Authorization: env.RAID_HELPER_API_KEY,
          },
        }),
      ]);

      // For the resolved event, we may need to re-fetch if we reused initialResponse
      let eventData: RaidHelperEventResponse;
      if (actualEventId !== input.eventId) {
        if (!eventResponse.ok) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Event not found: ${actualEventId}`,
          });
        }
        eventData = (await eventResponse.json()) as RaidHelperEventResponse;
      } else {
        eventData = initialData as unknown as RaidHelperEventResponse;
      }

      // Raidplan might not exist yet (no groups assigned)
      let planData: RaidHelperPlanResponse | null = null;
      if (planResponse.ok) {
        planData = (await planResponse.json()) as RaidHelperPlanResponse;
      }

      // Create a map of userId -> group assignment from raidplan
      // Include class/spec from assignment (may differ from signup class)
      const groupAssignments = new Map<
        string,
        {
          partyId: number;
          slotId: number;
          className: string | null;
          specName: string | null;
        }
      >();
      if (planData?.slots) {
        for (const slot of planData.slots) {
          if (slot.id) {
            groupAssignments.set(slot.id, {
              partyId: slot.groupNumber,
              slotId: slot.slotNumber,
              className: slot.className ?? null,
              specName: slot.specName ?? null,
            });
          }
        }
      }

      // Merge signup data with group assignments
      // Use assigned class/spec if present (overrides signup class/spec)
      const signUps = eventData.signUps ?? [];
      const signupsWithGroups = signUps.map((signup) => {
        const assignment = groupAssignments.get(signup.userId);
        return {
          ...signup,
          // Use assigned class/spec if available, fallback to signup class/spec
          className: assignment?.className ?? signup.className,
          specName: assignment?.specName ?? signup.specName,
          partyId: assignment?.partyId ?? null,
          slotId: assignment?.slotId ?? null,
          isAssigned: !!assignment,
        };
      });

      // Separate assigned vs unassigned
      const assigned = signupsWithGroups.filter((s) => s.isAssigned);
      const unassigned = signupsWithGroups.filter((s) => !s.isAssigned);

      return {
        event: {
          id: eventData.id,
          title: eventData.title,
          displayTitle: eventData.displayTitle,
          description: eventData.description,
          date: eventData.date,
          time: eventData.time,
          startTime: eventData.startTime,
          softresId: eventData.softresId,
          leaderName: eventData.leaderName,
          channelName: eventData.channelName,
        },
        plan: planData?.slots
          ? {
              partyPerRaid: planData.groupCount ?? 8,
              slotPerParty: planData.slotCount ?? 5,
              partyNames:
                planData.groups
                  ?.sort((a, b) => a.position - b.position)
                  .map((g) => g.name) ?? [],
            }
          : null,
        signups: {
          assigned,
          unassigned,
          total: signupsWithGroups.length,
        },
      };
    }),

  /**
   * Match Raid-Helper signups to database characters
   * Uses prefix matching and class matching to find the best match
   */
  matchSignupsToCharacters: raidManagerProcedure
    .input(
      z.object({
        signups: z.array(
          z.object({
            userId: z.string(),
            discordName: z.string(),
            className: z.string(),
            specName: z.string().optional(),
            partyId: z.number().nullable().optional(),
            slotId: z.number().nullable().optional(),
          }),
        ),
      }),
    )
    .query(async ({ ctx, input }) => {
      return matchSignupsToCharactersHelper(ctx.db, input.signups);
    }),

  /**
   * Find potential players based on attendance history
   * Excludes players already signed up (by primary character ID)
   */
  findPotentialPlayers: raidManagerProcedure
    .input(
      z.object({
        registeredPrimaryCharacterIds: z.array(z.number()),
        filterZone: z.string().nullable(),
        filterDayOfWeek: z.number().min(0).max(6).nullable(),
        roleFilter: z.enum(["all", "tank", "healer", "melee", "ranged"]),
      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        registeredPrimaryCharacterIds,
        filterZone,
        filterDayOfWeek,
        roleFilter,
      } = input;

      // Convert instance ID to zone name (e.g., "naxxramas" -> "Naxxramas")
      const zoneName = filterZone
        ? (getZoneForInstance(filterZone) ?? null)
        : null;

      // 1. Fetch the last 6 lockout weeks (The Timeline)
      // We want distinct weeks, sorted descending, limit 6
      const last6Weeks = await ctx.db
        .selectDistinct({
          lockoutWeek: trackedRaidsL6LockoutWk.lockoutWeek,
        })
        .from(trackedRaidsL6LockoutWk)
        .orderBy(desc(trackedRaidsL6LockoutWk.lockoutWeek))
        .limit(6);

      // Current week is index 0, previous week is index 1, etc.
      // We want to return [Week0, Week1, Week2, Week3, Week4, Week5]
      const timelineWeeks = last6Weeks.map((w) => w.lockoutWeek);

      // 2. Identify Matching Raids in this timeline
      // Find raidIds that match the user's filters AND fall within the timeline
      const timelineFilters = [];
      if (timelineWeeks.length > 0) {
        timelineFilters.push(
          inArray(trackedRaidsL6LockoutWk.lockoutWeek, timelineWeeks),
        );
      } else {
        // No raid history, return empty
        return { potentialPlayers: [] };
      }

      if (zoneName !== null) {
        timelineFilters.push(eq(trackedRaidsL6LockoutWk.zone, zoneName));
      }
      if (filterDayOfWeek !== null) {
        timelineFilters.push(
          sql`EXTRACT(DOW FROM ${trackedRaidsL6LockoutWk.date}::date) = ${filterDayOfWeek}`,
        );
      }

      const matchingRaids = await ctx.db
        .select({
          raidId: trackedRaidsL6LockoutWk.raidId,
          lockoutWeek: trackedRaidsL6LockoutWk.lockoutWeek,
        })
        .from(trackedRaidsL6LockoutWk)
        .where(and(...timelineFilters));

      const matchingRaidIds = matchingRaids.map((r) => r.raidId);
      const raidIdToWeek = new Map(
        matchingRaids.map((r) => [r.raidId, r.lockoutWeek]),
      );

      if (matchingRaidIds.length === 0) {
        return { potentialPlayers: [] };
      }

      // 3. Fetch Players & Aggregated Attendance
      // Find primary characters who attended ANY of the matching raids
      // Exclude already registered players

      // Alias characters table for family join
      const family = aliasedTable(characters, "family");

      const attendanceQuery = await ctx.db
        .select({
          primaryCharacterId: characters.primaryCharacterId,
          characterId: characters.characterId, // Used as fallback if primary is null
          characterName: characters.name,
          characterClass: characters.class,
          discordUserId: accounts.providerAccountId,
          attendedRaidIds: sql<
            number[]
          >`array_agg(distinct ${primaryRaidAttendeeAndBenchMap.raidId})`,
          // Aggregate all unique name:class:spec combinations for the family (mains + alts)
          familyData: sql<
            string[]
          >`array_agg(distinct ${family.name} || ':' || ${family.class} || ':' || COALESCE(${family.classDetail}, '')) filter (where ${family.class} is not null)`,
        })
        .from(primaryRaidAttendeeAndBenchMap)
        .innerJoin(
          characters,
          eq(
            primaryRaidAttendeeAndBenchMap.primaryCharacterId,
            characters.characterId,
          ),
        )
        // Join family members based on the same primary character ID
        .leftJoin(
          family,
          eq(
            sql`COALESCE(${family.primaryCharacterId}, ${family.characterId})`,
            primaryRaidAttendeeAndBenchMap.primaryCharacterId,
          ),
        )
        .leftJoin(users, eq(characters.characterId, users.characterId))
        .leftJoin(
          accounts,
          and(eq(users.id, accounts.userId), eq(accounts.provider, "discord")),
        )
        .where(
          and(
            inArray(primaryRaidAttendeeAndBenchMap.raidId, matchingRaidIds),
            isNotNull(primaryRaidAttendeeAndBenchMap.primaryCharacterId),
            eq(characters.isIgnored, false),
            // Ensure family members are not ignored if they exist
            or(
              isNotNull(family.characterId),
              isNotNull(characters.characterId),
            ),
            registeredPrimaryCharacterIds.length > 0
              ? notInArray(
                  primaryRaidAttendeeAndBenchMap.primaryCharacterId,
                  registeredPrimaryCharacterIds,
                )
              : undefined,
          ),
        )
        .groupBy(
          characters.primaryCharacterId,
          characters.characterId,
          characters.name,
          characters.class,
          accounts.providerAccountId,
        );

      // 4. Post-Process: Map attendance to matching weeks
      // Explicit cast to avoid Drizzle type inference issues with complex aggregations
      const potentialPlayers = (
        attendanceQuery as Array<{
          primaryCharacterId: number | null;
          characterId: number;
          characterName: string;
          characterClass: string;
          discordUserId: string | null;
          attendedRaidIds: number[];
          familyData: string[] | null;
        }>
      ).map((p) => {
        // Determine which weeks they attended based on the raids they went to
        const attendedWeeksSet = new Set<string>();
        for (const raidId of p.attendedRaidIds) {
          const week = raidIdToWeek.get(raidId);
          if (week) attendedWeeksSet.add(week);
        }

        // Create boolean array for the last 6 tracked weeks matched by filter
        // timelineWeeks is [Newest, ..., Oldest]
        const recentAttendance = timelineWeeks.map((week) =>
          attendedWeeksSet.has(week),
        );

        // Count for sorting
        const attendanceCount = recentAttendance.filter(Boolean).length;

        // Infer talentRole
        const classToDefaultRole: Record<
          string,
          ("Tank" | "Healer" | "Melee" | "Ranged")[]
        > = {
          // Default Warriors to Tank + Melee to cover both bases for generic imports
          Warrior: ["Tank", "Melee"],
          Rogue: ["Melee"],
          Hunter: ["Ranged"],
          Mage: ["Ranged"],
          Warlock: ["Ranged"],
          Priest: ["Healer"],
          Paladin: ["Healer"],
          Druid: ["Healer"],
          Shaman: ["Healer"],
          Deathknight: ["Melee"],
          Monk: ["Melee"],
        };

        const defaultRoles = classToDefaultRole[p.characterClass] ?? ["Melee"];

        const talentRole = defaultRoles[0] as
          | "Tank"
          | "Healer"
          | "Melee"
          | "Ranged"; // Primary default for single usage

        // Parse familyData to get classes and roles
        const familyClasses = new Set<string>();
        const familyRoles = new Set<string>();
        const familyClassNames: Record<string, Set<string>> = {};

        // Default if no family data
        if (!p.familyData || p.familyData.length === 0) {
          familyClasses.add(p.characterClass);
          defaultRoles.forEach((r) => familyRoles.add(r));

          let nameSet = familyClassNames[p.characterClass];
          if (!nameSet) {
            nameSet = new Set();
            familyClassNames[p.characterClass] = nameSet;
          }
          nameSet.add(p.characterName);
        } else {
          p.familyData.forEach((entry) => {
            const parts = entry.split(":");
            // Handle both new format (name:class:spec) and potential old/fallback format if any
            // We expect 3 parts now: name, class, spec
            let name = p.characterName;
            let cls = "";
            let spec = "";

            if (parts.length >= 3) {
              name = parts[0] ?? p.characterName;
              cls = parts[1] ?? "";
              spec = parts[2] ?? "";
            } else if (parts.length === 2) {
              // Fallback for previous format just in case: class:spec
              cls = parts[0] ?? "";
              spec = parts[1] ?? "";
            }

            if (cls) {
              familyClasses.add(cls);

              if (!familyClassNames[cls]) {
                familyClassNames[cls] = new Set();
              }
              const nameSet = familyClassNames[cls];
              if (nameSet) {
                nameSet.add(name);
              }

              let role: string | undefined;

              // 1. Try to infer from spec
              if (spec) {
                // Clean up spec string if needed (some WCL icons might be weird, but usually "Spec")
                // Our CLASS_SPECS uses specific names.
                // We can try to find the spec in CLASS_SPECS[cls]
                const specs = CLASS_SPECS[cls as keyof typeof CLASS_SPECS];
                if (specs) {
                  // Try exact match or loose match
                  // WCL might return "Warrior-Fury", but here we likely just get "Fury" if classDetail is "Fury"
                  // Check if spec string is just the spec name
                  const foundSpec = specs.find(
                    (s) =>
                      s.name.toLowerCase() === spec.toLowerCase() ||
                      spec.toLowerCase().includes(s.name.toLowerCase()),
                  );
                  if (foundSpec) {
                    role = foundSpec.talentRole;
                  }
                }
              }

              // 2. Fallback to class default
              // 2. Fallback to class default
              if (!role) {
                const defaults = classToDefaultRole[
                  cls as keyof typeof classToDefaultRole
                ] ?? ["Melee"];
                defaults.forEach((r) => familyRoles.add(r));
              } else {
                familyRoles.add(role);
              }
            }
          });
        }

        // Sort order: Tank, Melee, Ranged, Healer
        const roleOrder: Record<string, number> = {
          Tank: 0,
          Melee: 1,
          Ranged: 2,
          Healer: 3,
        };

        return {
          primaryCharacterId: p.primaryCharacterId ?? p.characterId,
          characterName: p.characterName,
          characterClass: p.characterClass,
          talentRole,
          familyClasses: Array.from(familyClasses).sort(),
          familyRoles: Array.from(familyRoles).sort(
            (a, b) => (roleOrder[a] ?? 9) - (roleOrder[b] ?? 9),
          ),
          familyClassNames: Object.fromEntries(
            Object.entries(familyClassNames).map(([k, v]) => [
              k,
              Array.from(v).sort(),
            ]),
          ),
          recentAttendance: recentAttendance,
          attendanceCount, // Helper for sorting
          discordUserId: p.discordUserId,
        };
      });

      // Filter by Role if needed
      const filteredPlayers =
        roleFilter === "all"
          ? potentialPlayers
          : potentialPlayers.filter((p) =>
              p.familyRoles.some((r) => r.toLowerCase() === roleFilter),
            );

      // Sort by attendance count descending
      return {
        potentialPlayers: filteredPlayers.sort(
          (a, b) => b.attendanceCount - a.attendanceCount,
        ),
      };
    }),
});
