import { z } from "zod";
import { sql, eq, or, inArray } from "drizzle-orm";
import { createTRPCRouter, raidManagerProcedure } from "~/server/api/trpc";
import { env } from "~/env";
import { TRPCError } from "@trpc/server";
import { characters } from "~/server/db/schema";

const RAID_HELPER_API_BASE = "https://raid-helper.dev/api";

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
interface ScheduledEvent {
  id: string;
  title: string;
  channelName: string;
  startTime: number;
  endTime: number;
  leaderName: string;
  description: string;
  imageUrl?: string;
}

interface ScheduledEventsResponse {
  scheduledEvents: ScheduledEvent[];
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
  partyId: number;
  slotId: number;
  name: string | null;
  userid: string | null;
  class: string | null;
  spec: string | null;
  spec1: string | null;
  color: string | null;
  isConfirmed: boolean;
}

interface RaidHelperPlanResponse {
  _id: string;
  hash: string;
  title: string;
  partyPerRaid: number;
  slotPerParty: number;
  raidDrop: RaidPlanSlot[];
  raidDropBench: RaidPlanSlot[];
  partyNames: string[];
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
  getScheduledEvents: raidManagerProcedure.query(async () => {
    const response = await fetch(
      `${RAID_HELPER_API_BASE}/v3/servers/${env.DISCORD_SERVER_ID}/scheduledevents`,
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

    const data = (await response.json()) as ScheduledEventsResponse;

    // Sort by startTime ascending (nearest first)
    return data.scheduledEvents.sort((a, b) => a.startTime - b.startTime);
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
        fetch(`${RAID_HELPER_API_BASE}/raidplan/${actualEventId}`),
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
      if (planData?.raidDrop) {
        for (const slot of planData.raidDrop) {
          if (slot.userid) {
            groupAssignments.set(slot.userid, {
              partyId: slot.partyId,
              slotId: slot.slotId,
              className: slot.class ?? null,
              specName: slot.spec ?? null,
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
        plan: planData
          ? {
              partyPerRaid: planData.partyPerRaid,
              slotPerParty: planData.slotPerParty,
              partyNames: planData.partyNames,
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

      // Resolve class names and separate matchable from skipped signups
      // Clean specName by removing numbers (e.g., "Protection1" -> "Protection")
      const signupsWithResolved = signups.map((s) => ({
        ...s,
        specName: s.specName?.replace(/[0-9]/g, "") ?? "",
        resolvedClass: resolveClassName(s.className, s.specName),
      }));

      const skippedSignups = signupsWithResolved.filter(
        (s) => s.resolvedClass === null,
      );
      const classSignups = signupsWithResolved.filter(
        (s) => s.resolvedClass !== null,
      );

      // Build skipped results
      const skippedResults: SignupMatchResult[] = skippedSignups.map((s) => ({
        userId: s.userId,
        discordName: s.discordName,
        className: s.className,
        specName: s.specName ?? "",
        partyId: s.partyId ?? null,
        slotId: s.slotId ?? null,
        status: "skipped",
      }));

      if (classSignups.length === 0) {
        return skippedResults;
      }

      // Extract search terms from discord names
      const searchTerms = classSignups.map((s) => ({
        ...s,
        searchTerm: extractSearchTerm(s.discordName),
      }));

      // Get unique search terms for the prefix query
      const uniqueTerms = [
        ...new Set(searchTerms.map((s) => normalizeName(s.searchTerm))),
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
      const allMatches: CharacterMatch[] = await ctx.db
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

      for (const signup of searchTerms) {
        const normalizedTerm = normalizeName(signup.searchTerm);
        const prefixMatches = matchesByPrefix.get(normalizedTerm) ?? [];

        if (prefixMatches.length === 0) {
          // No matches found
          results.push({
            userId: signup.userId,
            discordName: signup.discordName,
            className: signup.className,
            specName: signup.specName ?? "",
            partyId: signup.partyId ?? null,
            slotId: signup.slotId ?? null,
            status: "unmatched",
          });
          continue;
        }

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
            userId: signup.userId,
            discordName: signup.discordName,
            className: signup.className,
            specName: signup.specName ?? "",
            partyId: signup.partyId ?? null,
            slotId: signup.slotId ?? null,
            status: "unmatched",
            candidates: allCandidates,
          });
        } else if (matchingCandidates.length === 1) {
          // Single match found
          results.push({
            userId: signup.userId,
            discordName: signup.discordName,
            className: signup.className,
            specName: signup.specName ?? "",
            partyId: signup.partyId ?? null,
            slotId: signup.slotId ?? null,
            status: "matched",
            matchedCharacter: matchingCandidates[0],
          });
        } else {
          // Multiple matches - ambiguous
          results.push({
            userId: signup.userId,
            discordName: signup.discordName,
            className: signup.className,
            specName: signup.specName ?? "",
            partyId: signup.partyId ?? null,
            slotId: signup.slotId ?? null,
            status: "ambiguous",
            candidates: matchingCandidates,
          });
        }
      }

      return [...results, ...skippedResults];
    }),
});
