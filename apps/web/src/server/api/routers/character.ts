import {z} from "zod";
import {createTRPCRouter, publicProcedure} from "~/server/api/trpc";
import {aliasedTable, eq, inArray, sql} from "drizzle-orm";
import anyAscii from "any-ascii";
import {
  characters,
  raidLogAttendeeMap,
  raidLogs,
  raids,
} from "~/server/db/schema";
import {
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

export const character = createTRPCRouter({
  getCharacters: publicProcedure
    .input(z.optional(z.enum(["all", "primaryOnly", "secondaryOnly"])))
    .query(async ({ctx, input}) => {
      const characterSet = input ?? "all";
      const whereCharacterSet = (() => {
        switch (characterSet) {
          case "primaryOnly":
            return eq(characters.isPrimary, true);
          case "secondaryOnly":
            return eq(characters.isPrimary, false);
          default:
            return undefined;
        }
      })();
      /*
      const characterList = (await ctx.db.query.characters.findMany({
        orderBy: (characters, { asc }) => [asc(characters.slug)],
        columns: {
          name: true,
          server: true,
          slug: true,
          class: true,
          characterId: true,
          isPrimary: true,
          primaryCharacterId: true,
        },
        where: whereCharacterSet
      })) as RaidParticipant[];
      */

      const primaryCharacters = aliasedTable(characters, "primary_character")
      const characterList = await ctx.db
          .select({
            name: characters.name,
            server: characters.server,
            slug: characters.slug,
            class: characters.class,
            characterId: characters.characterId,
            isPrimary: characters.isPrimary,
            primaryCharacterId: characters.primaryCharacterId,
            primaryCharacterName: primaryCharacters.name
          })
          .from(characters)
          .leftJoin(primaryCharacters, eq(characters.primaryCharacterId, primaryCharacters.characterId));

      return convertParticipantArrayToCollection(characterList) ?? null;
    }),

  getCharacterById: publicProcedure
    .input(z.number())
    .query(async ({ctx, input}) => {
      const primaryCharacters = aliasedTable(characters, "primary_character")
      const character = await ctx.db
        .select({
          characterId: characters.characterId,
          name: characters.name,
          server: characters.server,
          slug: characters.slug,
          class: characters.class,
          classDetail: characters.classDetail,
          isPrimary: characters.isPrimary,
          primaryCharacterId: characters.primaryCharacterId,
          primaryCharacterName: primaryCharacters.name
        })
        .from(characters)
        .leftJoin(primaryCharacters, eq(characters.primaryCharacterId, primaryCharacters.characterId))
        .where(eq(characters.characterId, input));
      return character ?? null;
    }),

  getRaidsForCharacterId: publicProcedure
    .input(z.number())
    .query(async ({ctx, input}) => {
      const raidsAttended = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          attendanceWeight: raids.attendanceWeight,
          date: sql`${raids.date}
          ::date`,
        })
        .from(raids)
        .leftJoin(raidLogs, eq(raidLogs.raidId, raids.raidId))
        .leftJoin(
          raidLogAttendeeMap,
          eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId),
        )
        .where(eq(raidLogAttendeeMap.characterId, input));

      return raidsAttended ?? [];
    }),
});
