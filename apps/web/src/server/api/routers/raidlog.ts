import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  adminProcedure,
  createTRPCContext,
  createCallerFactory,
} from "~/server/api/trpc";
import { raidLogs, characters, raidLogAttendeeMap } from "~/server/db/schema";
import anyAscii from "any-ascii";
import type { db } from "~/server/db";
import { eq, inArray } from "drizzle-orm";
import { RaidReportQuery } from "~/server/api/wcl-queries";
import {
  GetWCLGraphQLQuery,
  RaidReportDataShaper,
} from "~/server/api/wcl-helpers";
import {
  RaidLog,
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { Session } from "next-auth";
import { convertParticipantArrayToCollection } from "~/server/api/routers/character";

// TO-DO -- look into this solution for updating insert conflicts:

// SOURCE: https://github.com/drizzle-team/drizzle-orm/issues/1728#issuecomment-2289927089
// import { getTableColumns, SQL, sql, Table } from 'drizzle-orm'
//
// export function conflictUpdateAllExcept<
//   T extends Table,
//   E extends (keyof T['$inferInsert'])[],
// >(table: T, except: E) {
//   const columns = getTableColumns(table)
//   const updateColumns = Object.entries(columns).filter(
//     ([col]) => !except.includes(col as keyof typeof table.$inferInsert),
//   )
//
//   return updateColumns.reduce(
//     (acc, [colName, table]) => ({
//       ...acc,
//       [colName]: sql.raw(`excluded.${table.name}`),
//     }),
//     {},
//   ) as Omit<Record<keyof typeof table.$inferInsert, SQL>, E[number]>
// }

// // usage:
// await db
//   .insert(column) // column: SQLiteTableWithColumns<...>
//   .values(values) // values: (typeof column.$inferInsert)[]
//   .onConflictDoUpdate({
//     set: conflictUpdateAllExcept(column, ["id"]),
//     target: column.id,
//   });

export const Slugify = (value: string) => {
  return anyAscii(value).toLowerCase();
};

/*
  Reusable router functions
 */

type DB = typeof db;

const queryGetWclLogById = async (input: string) => {
  const query = RaidReportQuery;
  const variables = { reportID: input };

  const rawRaidReportResponse = await GetWCLGraphQLQuery(query, variables);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return RaidReportDataShaper(await rawRaidReportResponse.json());
};

const queryRaidLogExists = async (db: DB, input: string) => {
  const raidLogResult = await db
    .select()
    .from(raidLogs)
    .where(eq(raidLogs.raidLogId, input))
    .limit(1);
  return !!raidLogResult.length;
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
    .onConflictDoNothing();


  await db
    .insert(characters)
    .values(
      Object.values(input.participants).map((participant) => ({
        characterId: participant.characterId,
        name: participant.name,
        class: participant.class,
        classDetail: participant.classDetail,
        server: participant.server,
        slug: Slugify(
          [
            participant.name,
            participant.server,
            participant.characterId.toString(),
          ].join("-"),
        ),
      })),
    )
    .onConflictDoNothing({ target: characters.characterId });

  await db
    .insert(raidLogAttendeeMap)
    .values(
      Object.values(input.participants).map((participant) => {
        return {
          raidLogId: input.raidLogId,
          characterId: participant.characterId,
        };
      }),
    )
    .onConflictDoNothing();
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

  raidLogExists: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => await queryRaidLogExists(ctx.db, input)),

  getParticipants: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const allCharacters = await ctx.db
        .selectDistinct({
          characterId: characters.characterId,
          name: characters.name,
          class: characters.class,
          classDetail: characters.classDetail,
          server: characters.server,
          slug: characters.slug,
        })
        .from(characters)
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
      const allCharacters = await ctx.db
        .selectDistinct({
          characterId: characters.characterId,
          name: characters.name,
          class: characters.class,
          classDetail: characters.classDetail,
          server: characters.server,
          slug: characters.slug,
        })
        .from(characters)
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
  getWclLogById: adminProcedure
    .input(z.string())
    .query(async ({ input }) => await queryGetWclLogById(input)),

  importAndGetRaidLogByRaidLogId: adminProcedure
    .input(
      z.object({
        raidLogId: z.string(),
        forceRaidLogRefresh: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const logExistsInDb = await queryRaidLogExists(ctx.db, input.raidLogId);

      if (!logExistsInDb || input.forceRaidLogRefresh) {
        const wclLog = await queryGetWclLogById(input.raidLogId);
        await mutateInsertRaidLogWithAttendees(ctx.db, ctx.session, wclLog);
      }
      return await queryGetRaidLogById(ctx.db, input.raidLogId);
    }),

  insertRaidLogWithAttendees: adminProcedure
    .input(inputInsertRaidLogWithAttendees)
    .mutation(async ({ ctx, input }) =>
      mutateInsertRaidLogWithAttendees(ctx.db, ctx.session, input),
    ),
});
