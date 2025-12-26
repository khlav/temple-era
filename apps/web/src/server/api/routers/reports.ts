import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  raids,
  characters,
  primaryRaidAttendeeAndBenchMap,
  reportDates,
} from "~/server/db/schema";
import { and, eq, gte, lte, inArray, desc, sql } from "drizzle-orm";
import { INSTANCE_TO_ZONE } from "~/lib/raid-zones";

const DEFAULT_ZONES = ["naxxramas", "aq40", "mc", "bwl"];

export const reports = createTRPCRouter({
  /**
   * Main procedure: Fetches complete attendance report data in one call
   * Returns raids, characters, attendance matrix, and date range
   */
  getAttendanceReportData: publicProcedure
    .input(
      z.object({
        startDate: z.string().optional(), // ISO date string
        endDate: z.string().optional(),
        zones: z.array(z.string()).min(1).default(DEFAULT_ZONES), // instance identifiers
        daysOfWeek: z.array(z.string()).optional(), // day values like "monday", "tuesday", etc.
        primaryCharacterIds: z.array(z.number()).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 1. Get date boundaries (use reportDates view if no custom dates)
      let startDate = input.startDate;
      let endDate = input.endDate;

      if (!startDate || !endDate) {
        const dates = await ctx.db.select().from(reportDates).limit(1);
        const start = dates[0]?.reportPeriodStart;
        const end = dates[0]?.reportPeriodEnd;
        if (start) {
          // Date from database is already in YYYY-MM-DD format or can be converted
          const startStr =
            typeof start === "string"
              ? start
              : (start as unknown as Date).toISOString();
          startDate = startStr.split("T")[0];
        }
        if (end) {
          const endStr =
            typeof end === "string"
              ? end
              : (end as unknown as Date).toISOString();
          endDate = endStr.split("T")[0];
        }
      }

      // 2. Convert instance identifiers to full zone names
      const zoneNames = input.zones
        .map((instance) => INSTANCE_TO_ZONE[instance])
        .filter((zone): zone is string => zone !== undefined);

      if (zoneNames.length === 0) {
        // Fallback to default zones if conversion fails
        const defaultZoneNames = DEFAULT_ZONES.map(
          (instance) => INSTANCE_TO_ZONE[instance],
        ).filter((zone): zone is string => zone !== undefined);
        zoneNames.push(...defaultZoneNames);
      }

      // 3. Build raid query filters
      const raidFilters = [
        gte(raids.date, startDate!),
        lte(raids.date, endDate!),
        inArray(raids.zone, zoneNames),
      ];

      // Add day of week filter if specified
      // PostgreSQL: 0=Sunday, 1=Monday, ..., 6=Saturday
      // We use lowercase day names: monday=1, tuesday=2, ..., sunday=0
      if (input.daysOfWeek && input.daysOfWeek.length > 0) {
        const dayNameToNumber: Record<string, number> = {
          monday: 1,
          tuesday: 2,
          wednesday: 3,
          thursday: 4,
          friday: 5,
          saturday: 6,
          sunday: 0,
        };
        const dayNumbers = input.daysOfWeek
          .map((day) => dayNameToNumber[day.toLowerCase()])
          .filter((num): num is number => num !== undefined);

        if (dayNumbers.length > 0) {
          // Extract day of week from date: EXTRACT(DOW FROM date) returns 0-6
          // Use inArray with the day numbers
          raidFilters.push(
            sql`EXTRACT(DOW FROM ${raids.date}) IN (${sql.join(
              dayNumbers.map((d) => sql`${d}`),
              sql`, `,
            )})`,
          );
        }
      }

      // 4. Fetch raids in date/zone range
      const raidsData = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          date: raids.date,
          zone: raids.zone,
          attendanceWeight: raids.attendanceWeight,
        })
        .from(raids)
        .where(and(...raidFilters))
        .orderBy(desc(raids.date));

      // 5. Fetch characters (if specified, or return empty for selector)
      let charactersData: Array<{
        characterId: number;
        name: string;
        class: string;
      }> = [];

      if (input.primaryCharacterIds && input.primaryCharacterIds.length > 0) {
        const characterFilters = [
          eq(characters.isPrimary, true),
          eq(characters.isIgnored, false),
          inArray(characters.characterId, input.primaryCharacterIds),
        ];

        const fetchedCharacters = await ctx.db
          .select({
            characterId: characters.characterId,
            name: characters.name,
            class: characters.class,
          })
          .from(characters)
          .where(and(...characterFilters));

        // Maintain the order from input.primaryCharacterIds (order entered into report)
        const characterMap = new Map(
          fetchedCharacters.map((c) => [c.characterId, c]),
        );
        charactersData = input.primaryCharacterIds
          .map((id) => characterMap.get(id))
          .filter(
            (c): c is { characterId: number; name: string; class: string } =>
              c !== undefined,
          );
      }

      // 6. Fetch attendance data for these raids & characters
      const raidIds = raidsData.map((r) => r.raidId);
      const characterIds = charactersData.map((c) => c.characterId);

      let attendanceData: Array<{
        raidId: number;
        primaryCharacterId: number;
        status: string | null;
        allCharacters?: Array<{
          characterId: number;
          name: string;
          class: string;
        }>;
      }> = [];

      if (raidIds.length > 0 && characterIds.length > 0) {
        const rawAttendance = await ctx.db
          .select({
            raidId: primaryRaidAttendeeAndBenchMap.raidId,
            primaryCharacterId:
              primaryRaidAttendeeAndBenchMap.primaryCharacterId,
            status: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
            allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
          })
          .from(primaryRaidAttendeeAndBenchMap)
          .where(
            and(
              inArray(primaryRaidAttendeeAndBenchMap.raidId, raidIds),
              inArray(
                primaryRaidAttendeeAndBenchMap.primaryCharacterId,
                characterIds,
              ),
            ),
          );

        // Filter out nulls and ensure types
        const filteredAttendance = rawAttendance
          .filter(
            (
              a,
            ): a is {
              raidId: number;
              primaryCharacterId: number;
              status: string | null;
              allCharacters: Array<{
                characterId: number;
                name: string;
              }> | null;
            } => a.raidId !== null && a.primaryCharacterId !== null,
          )
          .map((a) => ({
            raidId: a.raidId!,
            primaryCharacterId: a.primaryCharacterId!,
            status: a.status,
            allCharacters: a.allCharacters,
          }));

        // Collect all unique character IDs from allCharacters arrays
        const allCharacterIds = new Set<number>();
        for (const entry of filteredAttendance) {
          if (entry.allCharacters) {
            for (const char of entry.allCharacters) {
              if (char.characterId) {
                allCharacterIds.add(char.characterId);
              }
            }
          }
        }

        // Fetch character details (including class) for all attending characters
        const characterDetailsMap = new Map<
          number,
          { characterId: number; name: string; class: string }
        >();

        if (allCharacterIds.size > 0) {
          const characterDetails = await ctx.db
            .select({
              characterId: characters.characterId,
              name: characters.name,
              class: characters.class,
            })
            .from(characters)
            .where(
              inArray(characters.characterId, Array.from(allCharacterIds)),
            );

          for (const char of characterDetails) {
            characterDetailsMap.set(char.characterId, char);
          }
        }

        // Enrich attendance data with class information
        attendanceData = filteredAttendance.map((entry) => {
          const enrichedAllCharacters =
            entry.allCharacters
              ?.map((char) => {
                const details = characterDetailsMap.get(char.characterId);
                if (details) {
                  return {
                    characterId: details.characterId,
                    name: details.name,
                    class: details.class,
                  };
                }
                // Fallback to original data if class not found
                return {
                  characterId: char.characterId,
                  name: char.name,
                  class: "Unknown",
                };
              })
              .filter(
                (
                  c,
                ): c is { characterId: number; name: string; class: string } =>
                  c !== undefined,
              ) || [];

          return {
            raidId: entry.raidId,
            primaryCharacterId: entry.primaryCharacterId,
            status: entry.status,
            allCharacters:
              enrichedAllCharacters.length > 0
                ? enrichedAllCharacters
                : undefined,
          };
        });
      }

      return {
        raids: raidsData,
        characters: charactersData,
        attendance: attendanceData,
        dateRange: { startDate, endDate },
      };
    }),

  /**
   * Helper: Get all primary characters for the character selector dropdown
   */
  getPrimaryCharacters: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
      })
      .from(characters)
      .where(
        and(eq(characters.isPrimary, true), eq(characters.isIgnored, false)),
      )
      .orderBy(characters.name);
  }),
});
