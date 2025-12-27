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
  inArray,
  isNull,
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
  trackedRaidsCurrentLockout,
  reportDates,
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

  getPersonalAttendanceHeatmap: publicProcedure
    .input(
      z
        .object({
          characterId: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const characterId = input?.characterId ?? ctx.session?.user.characterId;
      if (!characterId) {
        return { weeks: [] };
      }

      // Get report dates to determine the 6 lockout weeks
      const reportDatesResult = await ctx.db
        .select()
        .from(reportDates)
        .limit(1);
      const reportPeriodStart = reportDatesResult[0]?.reportPeriodStart;

      // Calculate the 6 lockout weeks (Tuesday to Monday)
      // Each lockout week starts on Tuesday
      const lockoutWeeks: string[] = [];
      if (reportPeriodStart) {
        const startDate = new Date(reportPeriodStart);

        // Calculate Tuesday of the first week
        const firstTuesday = new Date(startDate);
        firstTuesday.setUTCDate(firstTuesday.getUTCDate() - 1);
        const dayOfWeek = firstTuesday.getUTCDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        firstTuesday.setUTCDate(firstTuesday.getUTCDate() - daysToMonday);
        firstTuesday.setUTCDate(firstTuesday.getUTCDate() + 1); // Now it's Tuesday

        // Generate 6 weeks starting from the first Tuesday
        for (let i = 0; i < 6; i++) {
          const weekStart = new Date(firstTuesday);
          weekStart.setUTCDate(weekStart.getUTCDate() + i * 7);
          lockoutWeeks.push(weekStart.toISOString().split("T")[0] ?? "");
        }
      }

      // Get all tracked raids from last 6 lockout weeks with user's attendance
      const raids = await ctx.db
        .select({
          raidId: trackedRaidsL6LockoutWk.raidId,
          name: trackedRaidsL6LockoutWk.name,
          date: trackedRaidsL6LockoutWk.date,
          zone: trackedRaidsL6LockoutWk.zone,
          attendanceWeight: trackedRaidsL6LockoutWk.attendanceWeight,
          lockoutWeek: trackedRaidsL6LockoutWk.lockoutWeek,
          attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
          allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
        })
        .from(trackedRaidsL6LockoutWk)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          and(
            eq(
              trackedRaidsL6LockoutWk.raidId,
              primaryRaidAttendeeAndBenchMap.raidId,
            ),
            eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
          ),
        )
        .where(sql`${trackedRaidsL6LockoutWk.attendanceWeight} > 0`)
        .orderBy(
          trackedRaidsL6LockoutWk.lockoutWeek,
          desc(trackedRaidsL6LockoutWk.date),
        );

      // Filter to only include raids where user attended/benched
      const filteredRaids = raids.filter(
        (raid) => raid.attendeeOrBench !== null,
      );

      // Initialize weekMap with all 6 lockout weeks
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
          };
        }
      >();

      // Initialize all 6 weeks with empty zones
      for (const weekStart of lockoutWeeks) {
        weekMap.set(weekStart, {
          weekStart,
          zones: {},
        });
      }

      // Populate with attendance data
      for (const raid of filteredRaids) {
        if (!raid.lockoutWeek || !raid.attendeeOrBench) continue;

        const weekKey = raid.lockoutWeek;
        if (!weekMap.has(weekKey)) {
          // Skip if week is not in our 6-week range
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

  getPersonalAttendanceThisWeek: publicProcedure
    .input(
      z
        .object({
          characterId: z.number().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const characterId = input?.characterId ?? ctx.session?.user.characterId;
      if (!characterId) {
        return { zones: {} };
      }

      // Get all tracked raids from current lockout with user's attendance
      const raids = await ctx.db
        .select({
          raidId: trackedRaidsCurrentLockout.raidId,
          name: trackedRaidsCurrentLockout.name,
          date: trackedRaidsCurrentLockout.date,
          zone: trackedRaidsCurrentLockout.zone,
          attendanceWeight: trackedRaidsCurrentLockout.attendanceWeight,
          attendeeOrBench: primaryRaidAttendeeAndBenchMap.attendeeOrBench,
          allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
        })
        .from(trackedRaidsCurrentLockout)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          and(
            eq(
              trackedRaidsCurrentLockout.raidId,
              primaryRaidAttendeeAndBenchMap.raidId,
            ),
            eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, characterId),
          ),
        )
        .where(sql`${trackedRaidsCurrentLockout.attendanceWeight} > 0`)
        .orderBy(desc(trackedRaidsCurrentLockout.date));

      // Filter to only include raids where user attended/benched
      const filteredRaids = raids.filter(
        (raid) => raid.attendeeOrBench !== null,
      );

      const zones: {
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
      } = {};

      // Populate with attendance data
      for (const raid of filteredRaids) {
        if (!raid.attendeeOrBench) continue;

        const zone = raid.zone ?? "";
        const status =
          raid.attendeeOrBench === "attendee" ? "attendee" : "bench";
        const characterNames =
          raid.allCharacters?.map((char) => char.name).filter(Boolean) ?? [];

        // Zones are stored as full names: "Naxxramas", "Temple of Ahn'Qiraj", "Blackwing Lair", "Molten Core"
        if (zone === "Naxxramas") {
          if (!zones.naxxramas) {
            zones.naxxramas = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
            };
          }
          zones.naxxramas.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Temple of Ahn'Qiraj") {
          if (!zones.aq40) {
            zones.aq40 = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
            };
          }
          zones.aq40.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Blackwing Lair") {
          if (!zones.bwl) {
            zones.bwl = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
            };
          }
          zones.bwl.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        } else if (zone === "Molten Core") {
          if (!zones.mc) {
            zones.mc = {
              attended: true,
              attendanceWeight: raid.attendanceWeight ?? 0,
              raids: [],
              isGrayed: false,
            };
          }
          zones.mc.raids.push({
            name: raid.name ?? "",
            status,
            characterNames,
          });
        }
      }

      // Check for MC graying (if Naxx + AQ40 + BWL all attended)
      const hasNaxx = !!zones.naxxramas;
      const hasAQ40 = !!zones.aq40;
      const hasBWL = !!zones.bwl;

      if (zones.mc && hasNaxx && hasAQ40 && hasBWL) {
        zones.mc.isGrayed = true;
      }

      return { zones };
    }),
});
