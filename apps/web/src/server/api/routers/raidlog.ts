import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  raidManagerProcedure,
} from "~/server/api/trpc";
import { raidLogs, characters, raidLogAttendeeMap } from "~/server/db/schema";
import type { db } from "~/server/db";
import { aliasedTable, eq, inArray, sql } from "drizzle-orm";
import { RaidReportQuery } from "~/server/api/wcl-queries";
import {
  GetWCLGraphQLQuery,
  RaidReportDataShaper,
} from "~/server/api/wcl-helpers";
import type {
  RaidLog,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import type { Session } from "next-auth";
import { convertParticipantArrayToCollection } from "~/server/api/routers/character";
import { Slugify } from "~/server/api/wcl-helpers";
/*
  Reusable router functions
 */

type DB = typeof db;

const queryGetWclLogById = async (input: string) => {
  const query = RaidReportQuery;
  const variables = { reportID: input };

  const rawRaidReportResponse = await GetWCLGraphQLQuery(query, variables);

  return RaidReportDataShaper(await rawRaidReportResponse.json());
};

const queryGetRaidLogById = async (db: DB, input: string) => {
  const raidLogResult = await db.query.raidLogs.findFirst({
    where: eq(raidLogs.raidLogId, input),
    columns: {
      name: true,
      raidLogId: true,
      raidId: true,
      startTimeUTC: true,
      endTimeUTC: true,
      zone: true,
      kills: true,
    },
    with: {
      raidLogAttendeeMap: {
        with: {
          character: {
            columns: {
              characterId: true,
              name: true,
              class: true,
              classDetail: true,
              server: true,
              slug: true,
            },
          },
        },
      },
    },
  });

  if (raidLogResult) {
    const { name, raidLogId, raidId, startTimeUTC, endTimeUTC, zone, kills } =
      raidLogResult;
    const raidLogAttendeeMap = raidLogResult.raidLogAttendeeMap;

    const participants = raidLogAttendeeMap.reduce((acc, rel) => {
      const participant = rel.character;
      acc[participant.characterId] = participant;
      return acc;
    }, {} as RaidParticipantCollection);
    return {
      name: name,
      raidLogId: raidLogId,
      raidId: raidId,
      startTimeUTC: startTimeUTC,
      endTimeUTC: endTimeUTC,
      zone: zone,
      kills: kills,
      participants: participants,
    } as RaidLog;
  }
  return null;
};

const mutateInsertRaidLogWithAttendees = async (
  db: DB,
  session: Session,
  input: RaidLog,
) => {
  // Insert or update raid log with onConflictDoUpdate
  await db
    .insert(raidLogs)
    // @ts-expect-error Ignore mapping issue
    .values({
      raidLogId: input.raidLogId,
      name: input.name,
      raidId: input.raidId,
      kills: input.kills,
      zone: input.zone,
      startTimeUTC: input.startTimeUTC,
      endTimeUTC: input.endTimeUTC,
      createdById: session.user.id,
      updatedById: session.user.id,
    })
    .onConflictDoUpdate({
      target: [raidLogs.raidLogId],
      set: {
        name: input.name,
        kills: input.kills,
        zone: input.zone,
        startTimeUTC: input.startTimeUTC,
        endTimeUTC: input.endTimeUTC,
        // Preserve existing raidId by not including it in the update set
      },
    });

  // Insert or update characters
  for (const participant of Object.values(input.participants)) {
    await db
      .insert(characters)
      .values({
        characterId: participant.characterId,
        name: participant.name,
        class: participant.class,
        classDetail: participant.classDetail,
        server: participant.server,
        createdById: session.user.id,
        slug: Slugify(
          [
            participant.name,
            participant.server,
            participant.characterId.toString(),
          ].join("-"),
        ),
      })
      .onConflictDoUpdate({
        target: [characters.characterId],
        set: {
          name: participant.name,
          class: participant.class,
          // Only update classDetail if the new value is specific (not same as class)
          // or if the existing value is null.
          classDetail: sql`CASE 
            WHEN ${participant.classDetail} != ${participant.class} THEN ${participant.classDetail} 
            ELSE COALESCE(${characters.classDetail}, ${participant.classDetail}) 
          END`,
          server: participant.server,
        },
      });
  }

  // Clear existing attendee mappings for this raid log to handle roster changes
  await db
    .delete(raidLogAttendeeMap)
    .where(eq(raidLogAttendeeMap.raidLogId, input.raidLogId));

  // Insert fresh attendee mappings
  await db.insert(raidLogAttendeeMap).values(
    Object.values(input.participants).map((participant) => {
      return {
        raidLogId: input.raidLogId,
        characterId: participant.characterId,
        createdById: session.user.id,
      };
    }),
  );
};

const inputInsertRaidLogWithAttendees = z.object({
  raidLogId: z.string().min(1),
  name: z.string().min(1),
  raidId: z.number().optional(),
  zone: z.string(),
  kills: z.array(z.string()),
  startTimeUTC: z.date(),
  endTimeUTC: z.date(),
  createdVia: z.string(),
  participants: z.record(
    z.string(),
    z.object({
      characterId: z.number(),
      name: z.string(),
      class: z.string(),
      classDetail: z.string(),
      server: z.string(),
    }),
  ),
});

/*
  Router
 */
export const raidLog = createTRPCRouter({
  getRaidLogByRaidLogId: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => await queryGetRaidLogById(ctx.db, input)),

  getParticipants: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const primaryCharacters = aliasedTable(characters, "primary_character");
      const allCharacters = await ctx.db
        .selectDistinct({
          characterId: characters.characterId,
          name: characters.name,
          class: characters.class,
          classDetail: characters.classDetail,
          server: characters.server,
          slug: characters.slug,
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
          raidLogAttendeeMap,
          eq(raidLogAttendeeMap.characterId, characters.characterId),
        )
        .where(eq(raidLogAttendeeMap.raidLogId, input));
      return convertParticipantArrayToCollection(allCharacters);
    }),

  getUniqueParticipantsFromMultipleLogs: publicProcedure
    .input(z.array(z.string()))
    .query(async ({ ctx, input }) => {
      const primaryCharacters = aliasedTable(characters, "primary_character");
      const allCharacters = await ctx.db
        .selectDistinct({
          characterId: characters.characterId,
          name: characters.name,
          class: characters.class,
          classDetail: characters.classDetail,
          server: characters.server,
          slug: characters.slug,
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
          raidLogAttendeeMap,
          eq(raidLogAttendeeMap.characterId, characters.characterId),
        )
        .where(inArray(raidLogAttendeeMap.raidLogId, input));
      return convertParticipantArrayToCollection(allCharacters);
    }),

  getRaidLogs: publicProcedure.query(async ({ ctx }) => {
    const raidLogs = await ctx.db.query.raidLogs.findMany();
    return raidLogs ?? null;
  }),

  getRaidLogsByRaidId: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const logs = await ctx.db
        .select()
        .from(raidLogs)
        .where(eq(raidLogs.raidId, input));
      return logs ?? null;
    }),

  /*
    Admin procedures
   */
  getWclLogById: raidManagerProcedure
    .input(z.string())
    .query(async ({ input }) => await queryGetWclLogById(input)),

  importAndGetRaidLogByRaidLogId: raidManagerProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      // Always fetch fresh data from WCL and update database
      const wclLog = await queryGetWclLogById(input);
      await mutateInsertRaidLogWithAttendees(ctx.db, ctx.session, wclLog);
      return await queryGetRaidLogById(ctx.db, input);
    }),

  insertRaidLogWithAttendees: raidManagerProcedure
    .input(inputInsertRaidLogWithAttendees)
    .mutation(async ({ ctx, input }) =>
      mutateInsertRaidLogWithAttendees(ctx.db, ctx.session, input),
    ),

  refreshRaidLogByRaidLogId: raidManagerProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      // Fetch fresh data from WCL API
      const wclLog = await queryGetWclLogById(input);

      // Update database with fresh data
      await mutateInsertRaidLogWithAttendees(ctx.db, ctx.session, wclLog);

      // Return updated raid log data
      return await queryGetRaidLogById(ctx.db, input);
    }),
});
