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
} from "drizzle-orm";
import {
  characters,
  primaryRaidAttendeeAndBenchMap,
  raids,
  trackedRaidsL6LockoutWk,
  raidLogAttendeeMap,
  raidBenchMap,
  raidLogs,
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
});
