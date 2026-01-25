import { z } from "zod";
import {
  raidManagerProcedure,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import {
  aliasedTable,
  and,
  type BinaryOperator,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  characters,
  primaryRaidAttendeeAndBenchMap,
  raids,
  trackedRaidsL6LockoutWk,
  raidLogAttendeeMap,
  raidBenchMap,
  raidLogs,
  primaryRaidAttendanceL6LockoutWk,
} from "~/server/db/schema";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";

export const convertParticipantArrayToCollection = (
  participants: RaidParticipant[],
) => {
  return participants.reduce((acc, rel) => {
    const participant = rel;
    acc[participant.characterId] = participant;
    return acc;
  }, {} as RaidParticipantCollection);
};

export const characterCols = {
  characterId: true,
  name: true,
  server: true,
  slug: true,
  class: true,
  classDetail: true,
  primaryCharacterId: true,
  isPrimary: true,
  isIgnored: true,
};

export const character = createTRPCRouter({
  getCharacters: publicProcedure
    .input(
      z.optional(z.enum(["all", "primary", "secondary", "secondaryEligible"])),
    )
    .query(async ({ ctx, input }) => {
      const primaryCharacters = aliasedTable(characters, "primary_character");

      if (input === "secondaryEligible") {
        // Assignable only -- e.g. only Secondary characters OR primary characters with no secondaries
        const countSecondary = ctx.db.$with("countSecondary").as(
          ctx.db
            .select({
              primaryCharacterId: characters.primaryCharacterId,
              countSecondaryCharacters: count(characters.characterId).as(
                "countSecondaryCharacters",
              ),
            })
            .from(characters)
            .groupBy(characters.primaryCharacterId),
        );

        const characterList = await ctx.db
          .with(countSecondary)
          .select({
            name: characters.name,
            server: characters.server,
            slug: characters.slug,
            class: characters.class,
            characterId: characters.characterId,
            isPrimary: characters.isPrimary,
            primaryCharacterId: characters.primaryCharacterId,
            primaryCharacterName: primaryCharacters.name,
          })
          .from(characters)
          .leftJoin(
            primaryCharacters,
            eq(characters.primaryCharacterId, primaryCharacters.characterId),
          )
          .leftJoin(
            countSecondary,
            eq(countSecondary.primaryCharacterId, characters.characterId),
          )
          .where(
            or(
              eq(countSecondary.countSecondaryCharacters, 0),
              isNull(countSecondary.countSecondaryCharacters),
            ),
          );

        // Get raid attendance counts by zone for each individual character (both attendee and bench)
        const raidAttendanceByZone = await ctx.db
          .select({
            characterId: raidLogAttendeeMap.characterId,
            zone: raids.zone,
            uniqueRaidCount: count(raids.raidId).as("uniqueRaidCount"),
          })
          .from(raidLogAttendeeMap)
          .innerJoin(
            raidLogs,
            eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId),
          )
          .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
          .where(eq(raidLogAttendeeMap.isIgnored, false))
          .groupBy(raidLogAttendeeMap.characterId, raids.zone);

        // Get bench counts by zone for each individual character
        const benchAttendanceByZone = await ctx.db
          .select({
            characterId: raidBenchMap.characterId,
            zone: raids.zone,
            uniqueRaidCount: count(raids.raidId).as("uniqueRaidCount"),
          })
          .from(raidBenchMap)
          .innerJoin(raids, eq(raidBenchMap.raidId, raids.raidId))
          .groupBy(raidBenchMap.characterId, raids.zone);

        // Convert character list to collection and add raid attendance data
        const characterCollection =
          convertParticipantArrayToCollection(characterList) ?? {};

        // Add raid attendance by zone to each character
        for (const attendance of raidAttendanceByZone) {
          const characterId = attendance.characterId;
          if (
            characterId &&
            characterCollection[characterId] &&
            attendance.zone
          ) {
            const character = characterCollection[characterId];
            character.raidAttendanceByZone ??= {};
            character.raidAttendanceByZone[attendance.zone] ??= {
              attendee: 0,
              bench: 0,
            };

            character.raidAttendanceByZone[attendance.zone]!.attendee = Number(
              attendance.uniqueRaidCount,
            );
          }
        }

        // Add bench attendance by zone to each character
        for (const bench of benchAttendanceByZone) {
          const characterId = bench.characterId;
          if (characterId && characterCollection[characterId] && bench.zone) {
            const character = characterCollection[characterId];
            character.raidAttendanceByZone ??= {};
            character.raidAttendanceByZone[bench.zone] ??= {
              attendee: 0,
              bench: 0,
            };

            character.raidAttendanceByZone[bench.zone]!.bench = Number(
              bench.uniqueRaidCount,
            );
          }
        }

        return characterCollection;
      } else {
        // Primary, Secondary, or All
        const characterFilter: BinaryOperator | SQL = (() => {
          switch (input) {
            case "primary":
              return eq(characters.isPrimary, true);
            case "secondary":
              return eq(characters.isPrimary, true);
            default:
              return inArray(characters.isPrimary, [true, false]); // get all
          }
        })();

        const characterList = await ctx.db
          .select({
            name: characters.name,
            server: characters.server,
            slug: characters.slug,
            class: characters.class,
            characterId: characters.characterId,
            isPrimary: characters.isPrimary,
            primaryCharacterId: characters.primaryCharacterId,
            primaryCharacterName: primaryCharacters.name,
          })
          .from(characters)
          .leftJoin(
            primaryCharacters,
            eq(characters.primaryCharacterId, primaryCharacters.characterId),
          )
          .where(characterFilter);

        // Get raid attendance counts by zone for each individual character (both attendee and bench)
        const raidAttendanceByZone = await ctx.db
          .select({
            characterId: raidLogAttendeeMap.characterId,
            zone: raids.zone,
            uniqueRaidCount: count(raids.raidId).as("uniqueRaidCount"),
          })
          .from(raidLogAttendeeMap)
          .innerJoin(
            raidLogs,
            eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId),
          )
          .innerJoin(raids, eq(raidLogs.raidId, raids.raidId))
          .where(eq(raidLogAttendeeMap.isIgnored, false))
          .groupBy(raidLogAttendeeMap.characterId, raids.zone);

        // Get bench counts by zone for each individual character
        const benchAttendanceByZone = await ctx.db
          .select({
            characterId: raidBenchMap.characterId,
            zone: raids.zone,
            uniqueRaidCount: count(raids.raidId).as("uniqueRaidCount"),
          })
          .from(raidBenchMap)
          .innerJoin(raids, eq(raidBenchMap.raidId, raids.raidId))
          .groupBy(raidBenchMap.characterId, raids.zone);

        // Convert character list to collection and add raid attendance data
        const characterCollection =
          convertParticipantArrayToCollection(characterList) ?? {};

        // Add raid attendance by zone to each character
        for (const attendance of raidAttendanceByZone) {
          const characterId = attendance.characterId;
          if (
            characterId &&
            characterCollection[characterId] &&
            attendance.zone
          ) {
            const character = characterCollection[characterId];
            character.raidAttendanceByZone ??= {};
            character.raidAttendanceByZone[attendance.zone] ??= {
              attendee: 0,
              bench: 0,
            };

            character.raidAttendanceByZone[attendance.zone]!.attendee = Number(
              attendance.uniqueRaidCount,
            );
          }
        }

        // Add bench attendance by zone to each character
        for (const bench of benchAttendanceByZone) {
          const characterId = bench.characterId;
          if (characterId && characterCollection[characterId] && bench.zone) {
            const character = characterCollection[characterId];
            character.raidAttendanceByZone ??= {};
            character.raidAttendanceByZone[bench.zone] ??= {
              attendee: 0,
              bench: 0,
            };

            character.raidAttendanceByZone[bench.zone]!.bench = Number(
              bench.uniqueRaidCount,
            );
          }
        }

        return characterCollection;
      }
    }),

  getCharacterById: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const characterResult = await ctx.db.query.characters.findMany({
        where: eq(characters.characterId, input),
        columns: characterCols,
        with: {
          primaryCharacter: {
            columns: characterCols,
          },
        },
      });

      const character = characterResult[0];

      const secondaryCharacters = (await ctx.db.query.characters.findMany({
        where: eq(characters.primaryCharacterId, input),
        columns: characterCols,
      })) as RaidParticipant[];

      return {
        ...character,
        primaryCharacterId: (character?.primaryCharacter as RaidParticipant)
          ?.characterId,
        primaryCharacterName: (character?.primaryCharacter as RaidParticipant)
          ?.name,
        primaryCharacterClass: (character?.primaryCharacter as RaidParticipant)
          ?.class,

        secondaryCharacters: secondaryCharacters,
      } as RaidParticipant;
    }),

  getRaidsForPrimaryCharacterId: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const raidsAttended = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          attendanceWeight: raids.attendanceWeight,
          date: raids.date,
          zone: raids.zone,
          attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
          allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
          raidLogIds: primaryRaidAttendeeAndBenchMap.raidLogIds,
        })
        .from(raids)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          eq(primaryRaidAttendeeAndBenchMap.raidId, raids.raidId),
        )
        .where(eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, input))
        .orderBy(desc(raids.date));

      return raidsAttended ?? [];
    }),

  getRaidAttendanceReportForPrimaryCharacterId: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const attendanceReport = await ctx.db
        .select({
          raidId: trackedRaidsL6LockoutWk.raidId,
          name: trackedRaidsL6LockoutWk.name,
          date: trackedRaidsL6LockoutWk.date,
          lockoutWeek: trackedRaidsL6LockoutWk.lockoutWeek,
          attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
          zone: trackedRaidsL6LockoutWk.zone,
          isParticipant: not(
            isNull(primaryRaidAttendeeAndBenchMap.primaryCharacterId),
          ),
          attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
        })
        .from(trackedRaidsL6LockoutWk)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          and(
            eq(
              trackedRaidsL6LockoutWk.raidId,
              primaryRaidAttendeeAndBenchMap.raidId,
            ),
            eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, input),
          ),
        )
        .orderBy(trackedRaidsL6LockoutWk.date);
      return attendanceReport.map((r) => ({
        ...r,
        primaryCharacterId: input,
      }));
    }),

  getCharactersWithSecondaries: raidManagerProcedure.query(async ({ ctx }) => {
    const charactersWithSecondaries = await ctx.db.query.characters.findMany({
      where: eq(characters.isPrimary, true),
      columns: {
        characterId: true,
        name: true,
        server: true,
        slug: true,
        class: true,
        classDetail: true,
        primaryCharacterId: true,
        isPrimary: true,
        isIgnored: true,
      },
      with: {
        secondaryCharacters: {
          columns: {
            characterId: true,
            name: true,
            server: true,
            slug: true,
            class: true,
            classDetail: true,
            primaryCharacterId: true,
            isPrimary: true,
            isIgnored: true,
          },
        },
      },
    });
    return charactersWithSecondaries || [];
  }),

  updatePrimaryCharacter: raidManagerProcedure
    .input(
      z.object({
        primaryCharacterId: z.number(),
        secondaryCharacterIds: z.number().array(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1 - Remove all existing associations to the target primary
      const clearedPrimaryCharacterIds = await ctx.db
        .update(characters)
        .set({
          primaryCharacterId: null,
        })
        .where(eq(characters.primaryCharacterId, input.primaryCharacterId))
        .returning({ characterId: characters.characterId });

      // 2 - Set the association on the array of alts
      const receivedNewPrimaryCharacterId = await ctx.db
        .update(characters)
        .set({
          primaryCharacterId: input.primaryCharacterId,
        })
        .where(inArray(characters.characterId, input.secondaryCharacterIds))
        .returning({ characterId: characters.characterId });

      return {
        primaryCharacterId: input.primaryCharacterId,
        clearedPrimary: clearedPrimaryCharacterIds,
        receivedNewPrimary: receivedNewPrimaryCharacterId,
      };
    }),

  updateIsIgnored: raidManagerProcedure
    .input(
      z.object({
        characterId: z.number(),
        isIgnored: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(characters)
        .set({ isIgnored: input.isIgnored })
        .where(eq(characters.characterId, input.characterId))
        .returning({
          characterId: characters.characterId,
          isIgnored: characters.isIgnored,
        });
      return updated[0];
    }),

  getPrimaryRaidAttendanceL6LockoutWk: publicProcedure
    .input(z.object({ characterId: z.number() }))
    .query(async ({ ctx, input }) => {
      const raids = await ctx.db
        .select()
        .from(primaryRaidAttendanceL6LockoutWk)
        .where(
          eq(primaryRaidAttendanceL6LockoutWk.characterId, input.characterId),
        );
      return raids ?? [];
    }),

  getAllPrimaryRaidAttendanceL6LockoutWk: publicProcedure.query(
    async ({ ctx }) => {
      const raids = await ctx.db
        .select()
        .from(primaryRaidAttendanceL6LockoutWk);
      return raids ?? [];
    },
  ),

  getWeeklyPrimaryCharacterAttendance: publicProcedure
    .input(
      z
        .object({
          characterId: z.number().optional(),
          weeksBack: z.number().optional().default(6),
          includeCurrentWeek: z.boolean().optional().default(true),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const characterId = input?.characterId ?? ctx.session?.user.characterId;
      if (!characterId) {
        return { weeks: [] };
      }

      const weeksBack = input?.weeksBack ?? 6;
      const includeCurrentWeek = input?.includeCurrentWeek ?? true;

      // Calculate date range
      // Current week starts on Tuesday: date_trunc('week', CURRENT_DATE - 1) + INTERVAL '1 day'
      // Calculate Tuesday of current week using JavaScript
      const currentDate = new Date();
      currentDate.setUTCHours(0, 0, 0, 0); // Normalize to midnight UTC

      // Calculate Tuesday of current week
      // date_trunc('week', date - 1) gives Monday before the date
      // Adding 1 day gives Tuesday
      const currentDateCopy = new Date(currentDate);
      currentDateCopy.setUTCDate(currentDateCopy.getUTCDate() - 1);
      const dayOfWeek = currentDateCopy.getUTCDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      currentDateCopy.setUTCDate(currentDateCopy.getUTCDate() - daysToMonday);
      currentDateCopy.setUTCDate(currentDateCopy.getUTCDate() + 1); // Now it's Tuesday
      const currentWeekStart = new Date(currentDateCopy);

      // Calculate start date (go back weeksBack weeks)
      const startDate = new Date(currentWeekStart);
      startDate.setUTCDate(startDate.getUTCDate() - weeksBack * 7);

      // Calculate end date
      const endDate = new Date(currentWeekStart);
      if (includeCurrentWeek) {
        endDate.setUTCDate(endDate.getUTCDate() + 7); // End of current week
      }

      // Format dates as YYYY-MM-DD strings for SQL
      const startDateStr = startDate.toISOString().split("T")[0] ?? "";
      const endDateStr = endDate.toISOString().split("T")[0] ?? "";

      if (!startDateStr || !endDateStr) {
        return { weeks: [] };
      }

      // Get all raids in the date range with user's attendance
      // Calculate lockout_week using SQL: (date_trunc('week', date - 1) + INTERVAL '1 day')::date
      // NOTE: We include ALL raids (attendanceWeight >= 0) to capture 20-man raids for badge evaluation
      const raidsResult = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          date: raids.date,
          zone: raids.zone,
          attendanceWeight: raids.attendanceWeight,
          lockoutWeek: sql<string>`(date_trunc('week', ${raids.date}::date - 1) + INTERVAL '1 day')::date::text`,
          attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
          allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
        })
        .from(raids)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          and(
            eq(raids.raidId, primaryRaidAttendeeAndBenchMap.raidId),
            eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
          ),
        )
        .where(
          and(
            gte(raids.date, startDateStr),
            lte(raids.date, endDateStr),
            sql`${raids.attendanceWeight} >= 0`,
          ),
        )
        .orderBy(raids.date);

      // Filter to only include raids where user attended/benched
      const filteredRaids = raidsResult.filter(
        (raid) => raid.attendeeOrBench !== null,
      );

      // Generate all lockout weeks in the range
      const lockoutWeeks: string[] = [];
      const currentWeekStartDate = new Date(currentWeekStart);
      const numWeeks = includeCurrentWeek ? weeksBack + 1 : weeksBack;

      for (let i = 0; i < numWeeks; i++) {
        const weekStart = new Date(currentWeekStartDate);
        weekStart.setUTCDate(weekStart.getUTCDate() - weeksBack * 7 + i * 7);
        lockoutWeeks.push(weekStart.toISOString().split("T")[0] ?? "");
      }

      // Initialize weekMap with all weeks
      const weekMap = new Map<
        string,
        {
          weekStart: string;
          zones: {
            naxxramas?: {
              attended: boolean;
              attendanceWeight: number;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
            };
            aq40?: {
              attended: boolean;
              attendanceWeight: number;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
            };
            bwl?: {
              attended: boolean;
              attendanceWeight: number;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
            };
            mc?: {
              attended: boolean;
              attendanceWeight: number;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
              isGrayed: boolean;
            };
            onyxia?: {
              attended: boolean;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
            };
            aq20?: {
              attended: boolean;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
            };
            zg?: {
              attended: boolean;
              raids: Array<{
                name: string;
                status: "attendee" | "bench";
                characterNames: string[];
              }>;
            };
          };
          isHistorical: boolean;
        }
      >();

      // Initialize all weeks with empty zones
      // Current week (if included) and 6 most recent complete weeks should always be opacity 100
      // Any weeks before those 6 complete weeks should be historical (opacity 30)
      for (let i = 0; i < lockoutWeeks.length; i++) {
        const weekStart = lockoutWeeks[i];
        if (!weekStart) continue;
        // Historical = weeks before the 6 most recent complete weeks
        // If includeCurrentWeek: current week + 6 complete weeks = 7 weeks at opacity 100
        //   So historical = i < length - 7
        // If not includeCurrentWeek: 6 complete weeks = 6 weeks at opacity 100
        //   So historical = i < length - 6
        const nonHistoricalWeeks = includeCurrentWeek ? 7 : 6;
        const isHistorical =
          lockoutWeeks.length > nonHistoricalWeeks &&
          i < lockoutWeeks.length - nonHistoricalWeeks;
        weekMap.set(weekStart, {
          weekStart,
          zones: {},
          isHistorical,
        });
      }

      // Populate with attendance data
      for (const raid of filteredRaids) {
        if (!raid.lockoutWeek || !raid.attendeeOrBench) continue;

        const weekKey = raid.lockoutWeek;
        if (!weekMap.has(weekKey)) {
          // Skip if week is not in our range
          continue;
        }

        const week = weekMap.get(weekKey)!;
        const zone = raid.zone ?? "";
        const status =
          raid.attendeeOrBench === "attendee" ? "attendee" : "bench";
        const characterNames =
          raid.allCharacters?.map((char) => char.name).filter(Boolean) ?? [];

        // Zones are stored as full names: "Naxxramas", "Temple of Ahn'Qiraj", "Blackwing Lair", "Molten Core"
        if (zone === "Naxxramas") {
          if (!week.zones.naxxramas) {
            week.zones.naxxramas = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
            };
          }
          week.zones.naxxramas.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Temple of Ahn'Qiraj") {
          if (!week.zones.aq40) {
            week.zones.aq40 = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
            };
          }
          week.zones.aq40.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Blackwing Lair") {
          if (!week.zones.bwl) {
            week.zones.bwl = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
            };
          }
          week.zones.bwl.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Molten Core") {
          if (!week.zones.mc) {
            week.zones.mc = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
              isGrayed: false,
            };
          }
          week.zones.mc.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Onyxia") {
          if (!week.zones.onyxia) {
            week.zones.onyxia = {
              attended: true,
              raids: [],
            };
          }
          week.zones.onyxia.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Ruins of Ahn'Qiraj") {
          if (!week.zones.aq20) {
            week.zones.aq20 = {
              attended: true,
              raids: [],
            };
          }
          week.zones.aq20.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Zul'Gurub") {
          if (!week.zones.zg) {
            week.zones.zg = {
              attended: true,
              raids: [],
            };
          }
          week.zones.zg.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        }
      }

      // Check for MC graying (if Naxx + AQ40 + BWL all attended in same week)
      for (const week of weekMap.values()) {
        const hasNaxx = !!week.zones.naxxramas;
        const hasAQ40 = !!week.zones.aq40;
        const hasBWL = !!week.zones.bwl;

        if (week.zones.mc && hasNaxx && hasAQ40 && hasBWL) {
          week.zones.mc.isGrayed = true;
        }
      }

      // Convert to array and sort by weekStart (oldest first)
      const weeks = Array.from(weekMap.values()).sort((a, b) =>
        a.weekStart.localeCompare(b.weekStart),
      );

      return { weeks };
    }),
});
