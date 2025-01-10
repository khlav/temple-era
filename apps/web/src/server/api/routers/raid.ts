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
  raidBenchMap,
} from "~/server/db/schema";
import {
  EmptyRaid,
  Raid,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import anyAscii from "any-ascii";
import { eq, getTableColumns, inArray, sql, SQL } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import type { db } from "~/server/db";

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

type DB = typeof db;

export const Slugify = (value: string) => {
  return anyAscii(value).toLowerCase();
};

const isEmptyObj = (obj: object) => {
  for (const i in obj) return false;
  return true;
};

const updateRaidLogRaidIds = async (db: DB, raidId: number, raidData: Raid) => {
  if (raidData.raidLogIds?.length ?? 0 > 0) {
    return db
      .update(raidLogs)
      .set({raidId: raidId})
      .where(inArray(raidLogs.raidLogId, raidData.raidLogIds ?? []))
      .returning({raidLogId: raidLogs.raidLogId});
  }
  return undefined;
};

const updateRaidBench = async (db: DB, raidId: number, raidData: Raid) => {
  const benchDeleteResult = await db
    .delete(raidBenchMap)
    .where(eq(raidBenchMap.raidId, raidId))
    .returning({
      raidId: raidBenchMap.raidId,
      characterId: raidBenchMap.characterId,
    });

  let benchInsertResult = undefined;
  if (!isEmptyObj(raidData.bench)) {
    benchInsertResult = await db
      .insert(raidBenchMap)
      .values(
        Object.values(raidData.bench ?? {}).map((character) => ({
          raidId: raidId,
          characterId: character.characterId,
        })),
      )
      .returning({
        raidId: raidBenchMap.raidId,
        characterId: raidBenchMap.characterId,
      });
  }
  return {
    benchDelete: benchDeleteResult,
    benchInsert: benchInsertResult,
  };
};

export const raid = createTRPCRouter({
  getRaids: publicProcedure.query(async ({ ctx }) => {
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
            image: true,
          },
        },
        raidLogs: {
          columns: {
            raidLogId: true,
          },
        },
      },
    });
    const raidsWithRaidLogIds = raids.map(
      (r) =>
        ({
          ...r,
          raidLogs: undefined,
          raidLogIds: r.raidLogs.map((rl) => rl.raidLogId),
          bench: {},
        }) as Raid,
    );
    return raidsWithRaidLogIds ?? null;
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

      const raidBenchResult = await ctx.db.query.raidBenchMap.findMany({
        columns: {
          raidId: true,
        },
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
        where: eq(raidBenchMap.raidId, input),
      });

      const raidBench = raidBenchResult.reduce((acc, rel) => {
        const benched = rel.character;
        acc[benched.characterId] = benched;
        return acc;
      }, {} as RaidParticipantCollection);

      return {
        ...(initialRaidResult[0] ?? EmptyRaid()),
        raidLogIds: raidLogsResult.map(({ raidLogId }) => raidLogId),
        bench: raidBench,
      } as Raid;
    }),

  getAttendeesByRaidId: publicProcedure
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

  insertRaid: adminProcedure
    .input(
      z.object({
        name: z.string(),
        date: z.string(), // stored/manipulated as a string in forms, e.g. 2025-01-01
        zone: z.string(),
        attendanceWeight: z.number(),
        raidLogIds: z.array(z.string()),
        bench: z
          .record(
            z.string(),
            z.object({
              characterId: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      const raidInsertResult = await ctx.db
        .insert(raids)
        .values({
          name: input.name,
          date: input.date,
          zone: input.zone,
          attendanceWeight: input.attendanceWeight,
          createdById: session.user.id,
          updatedById: session.user.id,
        })
        .returning({ raidId: raids.raidId, name: raids.name });

      const insertedRaidInfo = raidInsertResult[0];

      let raidLogUpdateResult = undefined;
      if (insertedRaidInfo?.raidId) {
        raidLogUpdateResult = updateRaidLogRaidIds(
          ctx.db,
          insertedRaidInfo.raidId,
          input as Raid,
        );
      }

      let benchDeleteResult = undefined;
      let benchInsertResult = undefined;
      if (insertedRaidInfo?.raidId && !isEmptyObj(input.bench ?? {})) {
        const { benchDelete, benchInsert } = await updateRaidBench(
          ctx.db,
          insertedRaidInfo.raidId,
          input as Raid,
        );

        benchDeleteResult = benchDelete ?? undefined;
        benchInsertResult = benchInsert ?? undefined;
      }


      return {
        raid: insertedRaidInfo,
        raidLogs: raidLogUpdateResult,
        benchDelete: benchDeleteResult,
        benchInsert: benchInsertResult,
      };
    }),

  updateRaid: adminProcedure
    .input(
      z.object({
        raidId: z.number(),
        name: z.string(),
        date: z.string(), // stored/manipulated as a string in forms, e.g. 2025-01-01
        zone: z.string(),
        attendanceWeight: z.number(),
        raidLogIds: z.array(z.string()),
        bench: z
          .record(
            z.string(),
            z.object({
              characterId: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      const raidUpdateResult = await ctx.db
        .update(raids)
        .set({
          name: input.name,
          date: input.date,
          zone: input.zone,
          attendanceWeight: input.attendanceWeight,
          updatedById: session.user.id,
        })
        .where(eq(raids.raidId, input.raidId))
        .returning({ raidId: raids.raidId, name: raids.name });

      const updatedRaidInfo = raidUpdateResult[0];

      const raidLogUpdateResult = updateRaidLogRaidIds(
        ctx.db,
        input.raidId,
        input as Raid,
      );

      let benchDeleteResult = undefined;
      let benchInsertResult = undefined;
      const { benchDelete, benchInsert } = await updateRaidBench(
        ctx.db,
        input.raidId,
        input as Raid,
      );

      benchDeleteResult = benchDelete ?? undefined;
      benchInsertResult = benchInsert ?? undefined;

      return {
        raid: updatedRaidInfo,
        raidLogs: raidLogUpdateResult,
        benchDelete: benchDeleteResult,
        benchInsert: benchInsertResult,
      };
    }),

  delete: adminProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .delete(raids)
        .where(eq(raids.raidId, input))
        .returning({ raidId: raids.raidId, name: raids.name });
    })

});
