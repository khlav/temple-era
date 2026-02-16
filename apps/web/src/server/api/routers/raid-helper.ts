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

const RAID_HELPER_API_BASE = "https://raid-helper.dev/api";

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

// Valid WoW class names (lowercase for comparison)
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

// Class names that should be skipped (non-matchable signups)
const SKIP_CLASS_NAMES = new Set([
  "bench",
  "tentative",
  "absent",
  "absence",
  "late",
]);

// Map Tank spec names to WoW class
const TANK_SPEC_TO_CLASS: Record<string, string> = {
  guardian: "Druid",
  protection: "Warrior",
};

// Types for Raid-Helper API responses
interface PostedEvent {
  id: string;
  title: string;
  displayTitle?: string;
  channelName: string;
  startTime: number;
  endTime: number;
  leaderName: string;
  description: string;
  imageUrl?: string;
  signUpCount?: number;
  softresId?: string;
  scheduledId?: string;
  channelId: string;
}

interface PostedEventsResponse {
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
  softresId?: string;
  signUps: RaidHelperSignup[];
  leaderId: string;
  leaderName: string;
  channelName: string;
}

interface RaidPlanSlot {
  groupNumber: number;
  slotNumber: number;
  name: string | null;
  id: string | null;
  className: string | null;
  specName: string | null;
  color: string | null;
  isConfirmed: string;
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
}

// Types for character matching
export type MatchStatus = "matched" | "ambiguous" | "unmatched" | "skipped";

export interface MatchedCharacter {
  characterId: number;
  characterName: string;
  characterServer: string;
  characterClass: string;
  primaryCharacterId: number | null;
  primaryCharacterName: string | null;
}

export interface SignupMatchResult {
  userId: string;
  discordName: string;
  className: string;
  specName: string;
  partyId: number | null;
  slotId: number | null;
  status: MatchStatus;
  matchedCharacter?: MatchedCharacter;
  candidates?: MatchedCharacter[];
}

/**
 * Extract search term from Discord name by taking the first contiguous run of letters
 */
function extractSearchTerm(discordName: string): string {
  // Find the first contiguous sequence of Unicode letters (handles "Kirk123", "Kïrk-Alt", etc.)
  const match = discordName.match(/\p{L}+/u);
  return match?.[0] ?? discordName.trim();
}

/**
 * Normalize a name for comparison:
 * - lowercase
 * - remove diacritics (é → e)
 * - remove emojis and special characters
 * - keep only alphanumeric
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[^a-z0-9]/g, ""); // Keep only alphanumeric
}

/**
 * Resolve a Raid-Helper className to a WoW class name
 * Returns null if the signup should be skipped (Bench, Tentative, etc.)
 * or if the class cannot be determined
 */
function resolveClassName(className: string, specName?: string): string | null {
  const lowerClass = className.toLowerCase();

  // Skip non-matchable signups
  if (SKIP_CLASS_NAMES.has(lowerClass)) {
    return null;
  }

  // Direct WoW class match
  if (WOW_CLASSES.has(lowerClass)) {
    // Capitalize first letter
    return lowerClass.charAt(0).toUpperCase() + lowerClass.slice(1);
  }

  // Tank → resolve via spec
  if (lowerClass === "tank" && specName) {
    return TANK_SPEC_TO_CLASS[specName.toLowerCase()] ?? null;
  }

  return null;
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
      const response = await fetch(
        `${RAID_HELPER_API_BASE}/v3/servers/${env.DISCORD_SERVER_ID}/events`,
        {
          headers: {
            Authorization: env.RAID_HELPER_API_KEY,
          },
        },
      );

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to fetch scheduled events: ${response.statusText}`,
        });
      }

      const data = (await response.json()) as PostedEventsResponse;

      // Fetch Discord ID for the current user if authenticated
      let userDiscordId: string | null = null;
      if (ctx.session?.user?.id) {
        const account = await ctx.db.query.accounts.findFirst({
          where: (accounts, { eq, and }) =>
            and(
              eq(accounts.userId, ctx.session!.user.id),
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
              `${RAID_HELPER_API_BASE}/v2/events/${e.id}`,
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
            channelName: e.channelName,
            startTime: e.startTime,
            leaderName: e.leaderName,
            signUpCount: e.signUpCount ?? 0,
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
        `${RAID_HELPER_API_BASE}/v2/events/${input.eventId}`,
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
          ? fetch(`${RAID_HELPER_API_BASE}/v2/events/${actualEventId}`)
          : Promise.resolve(initialResponse),
        fetch(`${RAID_HELPER_API_BASE}/v3/comps/${actualEventId}`),
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
      const { signups } = input;

      // Resolve class names
      // Clean specName by removing numbers (e.g., "Protection1" -> "Protection")
      const signupsWithResolved = signups.map((s) => ({
        ...s,
        specName: s.specName?.replace(/[0-9]/g, "") ?? "",
        resolvedClass: resolveClassName(s.className, s.specName),
        searchTerm: extractSearchTerm(s.discordName),
      }));

      // Get unique search terms for the prefix query (include ALL signups)
      const uniqueTerms = [
        ...new Set(signupsWithResolved.map((s) => normalizeName(s.searchTerm))),
      ];

      // Build OR conditions for prefix matching
      const prefixConditions = uniqueTerms.map(
        (term) => sql`LOWER(f_unaccent(${characters.name})) LIKE ${term + "%"}`,
      );

      // Character match type
      type CharacterMatch = {
        characterId: number;
        name: string;
        server: string;
        class: string;
        primaryCharacterId: number | null;
      };

      // Query all potential matches via prefix search
      // Note: If uniqueTerms is empty (no signups), we can skip query
      let allMatches: CharacterMatch[] = [];
      if (prefixConditions.length > 0) {
        allMatches = await ctx.db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            server: characters.server,
            class: characters.class,
            primaryCharacterId: characters.primaryCharacterId,
          })
          .from(characters)
          .where(
            sql`(${or(...prefixConditions)}) AND ${eq(characters.isIgnored, false)}`,
          );
      }

      // Get primary character info for matches that have a primary
      const primaryIds = Array.from(
        new Set(
          allMatches
            .map((m) => m.primaryCharacterId)
            .filter((id): id is number => id !== null),
        ),
      );

      let primaryCharacters: CharacterMatch[] = [];

      if (primaryIds.length > 0) {
        primaryCharacters = await ctx.db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            server: characters.server,
            class: characters.class,
            primaryCharacterId: characters.primaryCharacterId,
          })
          .from(characters)
          .where(inArray(characters.characterId, primaryIds));
      }

      const primaryMap = new Map(
        primaryCharacters.map((c) => [c.characterId, c]),
      );

      // Also fetch all alts (characters with the same primaryCharacterId)
      // to get the full "family" of each match
      const standaloneCharIds = allMatches
        .filter((m) => m.primaryCharacterId === null)
        .map((m) => m.characterId);
      const allPrimaryIds = Array.from(
        new Set([...primaryIds, ...standaloneCharIds]),
      );

      let familyMembers: CharacterMatch[] = [];

      if (allPrimaryIds.length > 0) {
        familyMembers = await ctx.db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            server: characters.server,
            class: characters.class,
            primaryCharacterId: characters.primaryCharacterId,
          })
          .from(characters)
          .where(
            sql`(${inArray(characters.primaryCharacterId, allPrimaryIds)} OR ${inArray(characters.characterId, allPrimaryIds)}) AND ${eq(characters.isIgnored, false)}`,
          );
      }

      // Group characters by their effective primary ID
      const familyMap = new Map<number, CharacterMatch[]>();

      for (const member of familyMembers) {
        const effectivePrimaryId =
          member.primaryCharacterId ?? member.characterId;
        if (!familyMap.has(effectivePrimaryId)) {
          familyMap.set(effectivePrimaryId, []);
        }
        familyMap.get(effectivePrimaryId)!.push(member);
      }

      // Create a map for prefix matching: normalized prefix -> all matches
      const matchesByPrefix = new Map<string, CharacterMatch[]>();

      for (const match of allMatches) {
        const normalizedName = normalizeName(match.name);
        // Check against each unique term if it's a prefix
        for (const term of uniqueTerms) {
          if (normalizedName.startsWith(term)) {
            if (!matchesByPrefix.has(term)) {
              matchesByPrefix.set(term, []);
            }
            matchesByPrefix.get(term)!.push(match);
          }
        }
      }

      // Process each signup
      const results: SignupMatchResult[] = [];

      for (const signup of signupsWithResolved) {
        const normalizedTerm = normalizeName(signup.searchTerm);
        const prefixMatches = matchesByPrefix.get(normalizedTerm) ?? [];

        // Common result props
        const baseResult = {
          userId: signup.userId,
          discordName: signup.discordName,
          className: signup.className,
          specName: signup.specName ?? "",
          partyId: signup.partyId ?? null,
          slotId: signup.slotId ?? null,
        };

        if (prefixMatches.length === 0) {
          results.push({
            ...baseResult,
            status: signup.resolvedClass ? "unmatched" : "skipped",
          });
          continue;
        }

        // CASE 1: SKIPPED SIGNUP (No resolved class)
        // We want to try to find a match anyway, but status remains 'skipped'
        if (!signup.resolvedClass) {
          // Candidates: prefer exact matches, fallback to all prefix matches
          const exactMatches = prefixMatches.filter(
            (m) => normalizeName(m.name) === normalizedTerm,
          );
          const candidates =
            exactMatches.length > 0 ? exactMatches : prefixMatches;

          // For skipped signups, we want to identify the PRIMARY character
          // Resolve each candidate to its Primary Character
          const uniquePrimaryIds = new Set<number>();
          const primaryCharacterMap = new Map<number, CharacterMatch>();

          for (const cand of candidates) {
            const pid = cand.primaryCharacterId ?? cand.characterId;
            uniquePrimaryIds.add(pid);
            if (!primaryCharacterMap.has(pid)) {
              // Find the actual primary character object
              const family = familyMap.get(pid) ?? [];
              const primary =
                primaryMap.get(pid) ??
                family.find(
                  (m) => m.primaryCharacterId === null || m.characterId === pid,
                );
              if (primary) {
                primaryCharacterMap.set(pid, primary);
              }
            }
          }

          if (uniquePrimaryIds.size === 1) {
            // Unambiguous match to a single person
            const primary = primaryCharacterMap.get(
              uniquePrimaryIds.values().next().value!,
            );
            if (primary) {
              results.push({
                ...baseResult,
                status: "skipped",
                matchedCharacter: {
                  characterId: primary.characterId,
                  characterName: primary.name,
                  characterServer: primary.server,
                  characterClass: primary.class,
                  primaryCharacterId: primary.primaryCharacterId,
                  primaryCharacterName: primary.name, // It is the primary
                },
              });
            } else {
              // Should not happen if data integrity is good
              results.push({ ...baseResult, status: "skipped" });
            }
          } else {
            // Ambiguous (matches multiple different people) or no primary found
            // For now, leave matchedCharacter empty to avoid confusion
            results.push({ ...baseResult, status: "skipped" });
          }
          continue;
        }

        // CASE 2: STANDARD MATCH (Has resolved class)
        // Logic remains similar to before: filter families by class

        // Get unique families from prefix matches
        const familyIds = new Set<number>();
        for (const match of prefixMatches) {
          familyIds.add(match.primaryCharacterId ?? match.characterId);
        }

        // For each family, find member matching the signup's resolved class
        const matchingCandidates: MatchedCharacter[] = [];

        for (const familyId of familyIds) {
          const family = familyMap.get(familyId) ?? [];
          const primaryChar =
            primaryMap.get(familyId) ??
            family.find(
              (m) =>
                m.primaryCharacterId === null || m.characterId === familyId,
            );

          // Find family member matching the resolved class
          const classMatch = family.find(
            (m) =>
              m.class.toLowerCase() === signup.resolvedClass!.toLowerCase(),
          );

          if (classMatch) {
            matchingCandidates.push({
              characterId: classMatch.characterId,
              characterName: classMatch.name,
              characterServer: classMatch.server,
              characterClass: classMatch.class,
              primaryCharacterId: classMatch.primaryCharacterId,
              primaryCharacterName: primaryChar?.name ?? null,
            });
          }
        }

        if (matchingCandidates.length === 0) {
          // No class match found - return all prefix matches as candidates
          const allCandidates = prefixMatches.map((m) => {
            const primaryChar = primaryMap.get(
              m.primaryCharacterId ?? m.characterId,
            );
            return {
              characterId: m.characterId,
              characterName: m.name,
              characterServer: m.server,
              characterClass: m.class,
              primaryCharacterId: m.primaryCharacterId,
              primaryCharacterName: primaryChar?.name ?? null,
            };
          });

          results.push({
            ...baseResult,
            status: "unmatched",
            candidates: allCandidates,
          });
        } else if (matchingCandidates.length === 1) {
          // Single match found
          results.push({
            ...baseResult,
            status: "matched",
            matchedCharacter: matchingCandidates[0],
          });
        } else {
          // Multiple matches - ambiguous
          results.push({
            ...baseResult,
            status: "ambiguous",
            candidates: matchingCandidates,
          });
        }
      }

      return results;
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
