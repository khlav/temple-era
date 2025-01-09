import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  adminProcedure,
} from "~/server/api/trpc";
import {
  raidLogs,
  raidAttendeeMap,
  characters,
  raidLogAttendeeMap,
  raids,
} from "~/server/db/schema";
import { EmptyRaid, Raid } from "~/server/api/interfaces/raid";
import anyAscii from "any-ascii";
import { eq } from "drizzle-orm";

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

export const raid = createTRPCRouter({
  getRaids: publicProcedure.query(async ({ ctx }) => {
    const raids = (await ctx.db.query.raids.findMany({
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
            image: true,
          },
        },
      },
    })) as Raid[];
    return raids ?? null;
  }),

  getRaidById: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const initialRaidResult = await ctx.db
        .select({
          raidId: raids.raidId,
          name: raids.name,
          date: raids.date,
          zone: raids.zone,
          attendanceWeight: raids.attendanceWeight,
        })
        .from(raids)
        .where(eq(raids.raidId, input))
        .limit(1);

      const raidLogsResult = await ctx.db
        .select({
          raidLogId: raidLogs.raidLogId,
        })
        .from(raidLogs)
        .where(eq(raidLogs.raidId, input));
      console.log(raidLogsResult);

      return {
        ...(initialRaidResult[0] ?? EmptyRaid()),
        raidLogIds: raidLogsResult.map(({ raidLogId }) => raidLogId),
    } as Raid;
    }),

  getRaidAttendeesByRaidId: publicProcedure
    .input(z.number())
    .query(async ({ ctx, input }) => {
      const attendees = await ctx.db
        .select({
          name: characters.name,
          slug: characters.slug,
          characterCount: raidAttendeeMap.characterCount,
          characterNames: raidAttendeeMap.characterNames,
        })
        .from(characters)
        .leftJoin(
          raidAttendeeMap,
          eq(characters.characterId, raidAttendeeMap.primaryCharacterId),
        )
        .where(eq(raidAttendeeMap.raidId, input))
        .orderBy(characters.slug);
      return attendees ?? null;
    }),

  getRaidLogs: publicProcedure.query(async ({ ctx }) => {
    const raidLogs = await ctx.db.query.raidLogs.findMany();
    return raidLogs ?? null;
  }),
});
