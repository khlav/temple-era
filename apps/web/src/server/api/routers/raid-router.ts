import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  adminProcedure,
} from "~/server/api/trpc";
import {raidLogs, characters, raidLogAttendeeMap, raids} from "~/server/db/schema";
import anyAscii from "any-ascii";
import {eq} from "drizzle-orm";

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

export const Slugify = (value: string) => { return anyAscii(value).toLowerCase(); };

export const raidRouter = createTRPCRouter({

  getRaids: publicProcedure.query( async ({ ctx }) => {
    const raids = await ctx.db.query.raids.findMany({
      orderBy: (raids, { desc }) => [desc(raids.date)],
      columns: {
        createdById: false,
        updatedById: false,
        createdAt: false,
        updatedAt: false,
      },
      with: {
        creator: {
          columns: {
            name: true,
            image: true
          },
          with: {
            character: {
              columns: {
                name: true,
                slug: true,
                isPrimary: true
              },
            },
          },
        },
      },
    });
    return raids ?? null;
  }),

  getRaidById: publicProcedure
    .input(z.number())
    .query( async ({ ctx, input }) => {
      const raid = await ctx.db
        .select()
        .from(raids)
        .where(eq(raids.raidId, input))
      return raid ?? null;
    }),

  getRaidLogsByRaidId: publicProcedure
    .input(z.number())
    .query( async ({ ctx, input }) => {
      const logs = await ctx.db
        .select()
        .from(raidLogs)
        .where(eq(raidLogs.raidId, input))
      return logs ?? null;
    }),

  getRaidAttendeesByRaidId: publicProcedure
    .input(z.number())
    .query( async ({ ctx, input }) => {
      const attendees = await ctx.db
        .selectDistinctOn(
          [characters.slug],
          {
            name: characters.name,
            slug: characters.slug,
            isPrimary: characters.isPrimary,
          }
        )
        .from(characters)
        .leftJoin(raidLogAttendeeMap, eq(characters.characterId, raidLogAttendeeMap.characterId))
        .leftJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
        .leftJoin(raids, eq(raidLogs.raidId, raids.raidId))
        .where(eq(raids.raidId, input))
      return attendees ?? null;
    }),

  getRaidLogs: publicProcedure.query(async ({ ctx }) => {
    const raidLogs = await ctx.db.query.raidLogs.findMany();
    return raidLogs ?? null;
  }),

  insertRaidLogWithAttendees: adminProcedure
    .input(
      z.object({
        raidLogId: z.string().min(1),
        name: z.string().min(1),
        raidId: z.number().optional(),
        kills: z.array(z.string()),
        startTimeUTC: z.date(),
        endTimeUTC: z.date(),
        createdVia: z.string(),
        participants: z.array(
          z.object({
            characterId: z.number(),
            name: z.string(),
            class: z.string(),
            classDetail: z.string(),
            server: z.string()
          })
        )
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Insert the raids log
      await ctx.db.insert(raidLogs)
        // @ts-expect-error Ignore mapping issue
        .values({
          raidLogId: input.raidLogId,
          name: input.name,
          raidId: input.raidId,
          kills: input.kills,
          startTimeUTC: input.startTimeUTC,
          endTimeUTC: input.endTimeUTC,
          createdById: ctx.session.user.id,
          updatedById: ctx.session.user.id,
        })
        .onConflictDoNothing();

      await ctx.db.insert(characters)
        .values(input.participants.map((participant) => {
          return {
              characterId: participant.characterId,
              name: participant.name,
              class: participant.class,
              classDetail: participant.classDetail,
              server: participant.server,
              slug: Slugify(participant.name + '-' + participant.server),
              createdById: ctx.session.user.id,
              createdVia: input.createdVia,
              updatedById: ctx.session.user.id,
            };
          }))
        .onConflictDoNothing({target: characters.characterId});

      await ctx.db.insert(raidLogAttendeeMap)
        .values(input.participants.map((participant) => {
          return {
            raidLogId: input.raidLogId,
            characterId: participant.characterId,
          };
        }))
        .onConflictDoNothing();


    }),
});