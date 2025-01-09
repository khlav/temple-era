import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {eq, sql} from "drizzle-orm";
import anyAscii from "any-ascii";
import {characters, raidLogAttendeeMap, raidLogs, raids} from "~/server/db/schema";
import {RaidParticipant, RaidParticipantCollection} from "~/server/api/interfaces/raid";
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
  getCharacters: publicProcedure.query(async ({ ctx }) => {
    const characters = await ctx.db.query.characters.findMany({
      orderBy: (characters, { asc }) => [asc(characters.slug)],
      columns: {
        name: true,
        server: true,
        slug: true,
        class: true,
        characterId: true,
      },
    }) as RaidParticipant[];

    return convertParticipantArrayToCollection(characters) ?? null;
  }),

  getCharacterById: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const character = await ctx.db
        .select()
        .from(characters)
        .where(eq(characters.characterId, input));
      return character ?? null;
    }),

  getRaidsForCharacterId: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const raidsAttended = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          attendanceWeight: raids.attendanceWeight,
          date: sql`${raids.date}::date`,
        })
        .from(raids)
        .leftJoin(raidLogs, eq(raidLogs.raidId, raids.raidId))
        .leftJoin(raidLogAttendeeMap, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
        .where(eq(raidLogAttendeeMap.characterId, input));

      return raidsAttended ?? [];
    }),
});
