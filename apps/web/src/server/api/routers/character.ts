import { z } from "zod";
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import {
  aliasedTable,
  type BinaryOperator,
  count,
  eq,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import anyAscii from "any-ascii";
import {
  characters,
  primaryRaidAttendeeAndBenchMap,
  raids,
} from "~/server/db/schema";
import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";

export const Slugify = (value: string) => {
  return anyAscii(value).toLowerCase();
};

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

        return convertParticipantArrayToCollection(characterList) ?? null;
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

        return convertParticipantArrayToCollection(characterList) ?? null;
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
          allCharacters: primaryRaidAttendeeAndBenchMap.allCharacters,
          raidLogIds: primaryRaidAttendeeAndBenchMap.raidLogIds,
        })
        .from(raids)
        .leftJoin(
          primaryRaidAttendeeAndBenchMap,
          eq(primaryRaidAttendeeAndBenchMap.raidId, raids.raidId),
        )
        .where(eq(primaryRaidAttendeeAndBenchMap.primaryCharacterId, input));

      return raidsAttended ?? [];
    }),

  getCharactersWithSecondaries: adminProcedure.query(async ({ ctx }) => {
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

  updatePrimaryCharacter: adminProcedure
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
});
