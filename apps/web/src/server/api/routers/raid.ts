import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
  raidManagerProcedure,
} from "~/server/api/trpc";
import { raidLogs, raids, raidBenchMap, users } from "~/server/db/schema";
import {
  EmptyRaid,
  type Raid,
  type RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { eq, inArray } from "drizzle-orm";
import type { db } from "~/server/db";
import type { Session } from "next-auth";

type DB = typeof db;

const isEmptyObj = (obj: object) => {
  for (const i in obj) return false;
  return true;
};

const updateRaidLogRaidIds = async (
  db: DB,
  session: Session,
  raidId: number,
  raidData: Raid,
) => {
  if (raidData.raidLogIds?.length ?? 0 > 0) {
    return db
      .update(raidLogs)
      .set({ raidId: raidId, createdById: session.user.id })
      .where(inArray(raidLogs.raidLogId, raidData.raidLogIds ?? []))
      .returning({ raidLogId: raidLogs.raidLogId });
  }
  return undefined;
};

const updateRaidBench = async (
  db: DB,
  session: Session,
  raidId: number,
  raidData: Raid,
) => {
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
          createdById: session.user.id,
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
          creator: {
            name: users.name,
            image: users.image,
          },
        })
        .from(raids)
        .leftJoin(users, eq(users.id, raids.createdById))
        .where(eq(raids.raidId, input))
        .limit(1);

      const raidLogsResult = await ctx.db
        .select({
          raidLogId: raidLogs.raidLogId,
          kills: raidLogs.kills,
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
              isPrimary: true,
              primaryCharacterId: true,
            },
            with: {
              primaryCharacter: {
                columns: {
                  name: true,
                },
              },
            },
          },
        },
        where: eq(raidBenchMap.raidId, input),
      });

      const raidBench = raidBenchResult.reduce((acc, rel) => {
        const benched = {
          ...rel.character,
          primaryCharacterName: rel.character?.primaryCharacter?.name,
          isIgnored: false,
        };
        acc[benched.characterId] = benched;
        return acc;
      }, {} as RaidParticipantCollection);

      return {
        ...(initialRaidResult[0] ?? EmptyRaid()),
        raidLogIds: raidLogsResult.map((raidLog) => raidLog.raidLogId),
        kills: raidLogsResult.reduce((acc, rel) => {
          const combinedKillSet = [...acc, ...rel.kills];
          return [...new Set(combinedKillSet)];
        }, [] as string[]),
        bench: raidBench,
      } as Raid;
    }),

  insertRaid: raidManagerProcedure
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
          ctx.session,
          insertedRaidInfo.raidId,
          input as Raid,
        );
      }

      let benchDeleteResult = undefined;
      let benchInsertResult = undefined;
      if (insertedRaidInfo?.raidId && !isEmptyObj(input.bench ?? {})) {
        const { benchDelete, benchInsert } = await updateRaidBench(
          ctx.db,
          ctx.session,
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

  updateRaid: raidManagerProcedure
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
        ctx.session,
        input.raidId,
        input as Raid,
      );

      let benchDeleteResult = undefined;
      let benchInsertResult = undefined;
      const { benchDelete, benchInsert } = await updateRaidBench(
        ctx.db,
        ctx.session,
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

  delete: raidManagerProcedure
    .input(z.number())
    .mutation(async ({ ctx, input }) => {
      return await ctx.db
        .delete(raids)
        .where(eq(raids.raidId, input))
        .returning({ raidId: raids.raidId, name: raids.name });
    }),
});
