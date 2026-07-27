// src/server/api/v2/types/raid.ts
import { and, eq, inArray } from "drizzle-orm";
import { raidLogs, raidLogAttendeeMap, raidBenchMap, characters } from "~/server/db/schema";
import {
  RaidRef,
  RaidLogRef,
  RaidLogAttendeeRef,
  CharacterRef,
  CharacterStatusRef,
  FamilyStatusRef,
} from "../refs";
import { RaidZoneEnum, DB_ZONE_TO_GQL, type RaidZoneValues } from "./enums";
import { requireUser } from "../context";

RaidRef.implement({
  fields: (t) => ({
    id: t.exposeInt("raidId"),
    name: t.exposeString("name"),
    date: t.exposeString("date"),
    zone: t.field({
      type: RaidZoneEnum,
      resolve: (raid) => (DB_ZONE_TO_GQL[raid.zone] ?? "MOLTEN_CORE") as RaidZoneValues,
    }),
    attendanceWeight: t.exposeFloat("attendanceWeight"),
    logs: t.field({
      type: [RaidLogRef],
      resolve: async (raid, _args, ctx) => {
        requireUser(ctx);
        return ctx.db.select().from(raidLogs).where(eq(raidLogs.raidId, raid.raidId));
      },
    }),
    bench: t.field({
      type: [CharacterRef],
      resolve: async (raid, _args, ctx) => {
        requireUser(ctx);
        const benchRows = await ctx.db
          .select({ characterId: raidBenchMap.characterId })
          .from(raidBenchMap)
          .where(eq(raidBenchMap.raidId, raid.raidId));
        if (benchRows.length === 0) return [];
        return ctx.db
          .select()
          .from(characters)
          .where(
            inArray(
              characters.characterId,
              benchRows.map((r) => r.characterId),
            ),
          );
      },
    }),
    characterStatus: t.field({
      type: [CharacterStatusRef],
      args: {
        characterIds: t.arg.intList({ required: false }),
      },
      resolve: async (raid, args, ctx) => {
        requireUser(ctx);

        const attendeeWhere = args.characterIds?.length
          ? and(
              eq(raidLogs.raidId, raid.raidId),
              inArray(raidLogAttendeeMap.characterId, args.characterIds),
              eq(raidLogAttendeeMap.isIgnored, false),
            )
          : and(eq(raidLogs.raidId, raid.raidId), eq(raidLogAttendeeMap.isIgnored, false));

        const [attendeeRows, benchRows] = await Promise.all([
          ctx.db
            .selectDistinct({ characterId: raidLogAttendeeMap.characterId })
            .from(raidLogAttendeeMap)
            .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
            .where(attendeeWhere),
          ctx.db
            .select({ characterId: raidBenchMap.characterId })
            .from(raidBenchMap)
            .where(
              args.characterIds?.length
                ? and(
                    eq(raidBenchMap.raidId, raid.raidId),
                    inArray(raidBenchMap.characterId, args.characterIds),
                  )
                : eq(raidBenchMap.raidId, raid.raidId),
            ),
        ]);

        const attendedIds = new Set(attendeeRows.map((r) => r.characterId));
        const benchIds = new Set(benchRows.map((r) => r.characterId));

        // Universe: explicit list OR everyone who participated (no ABSENT in the latter case)
        const allIds = args.characterIds?.length
          ? args.characterIds
          : [...new Set([...attendedIds, ...benchIds])];

        if (allIds.length === 0) return [];

        const charRows = await ctx.db
          .select()
          .from(characters)
          .where(inArray(characters.characterId, allIds));

        return charRows.map((c) => ({
          character: c,
          status: (attendedIds.has(c.characterId)
            ? "ATTENDED"
            : benchIds.has(c.characterId)
              ? "BENCH"
              : "ABSENT") as "ATTENDED" | "BENCH" | "ABSENT",
        }));
      },
    }),
    familyStatus: t.field({
      type: FamilyStatusRef,
      args: {
        primaryCharacterId: t.arg.int({ required: true }),
      },
      resolve: async (raid, args, ctx) => {
        requireUser(ctx);

        const secondaries = await ctx.db
          .select({ characterId: characters.characterId })
          .from(characters)
          .where(eq(characters.primaryCharacterId, args.primaryCharacterId));
        const familyIds = [args.primaryCharacterId, ...secondaries.map((s) => s.characterId)];

        const [attendeeRows, benchRows] = await Promise.all([
          ctx.db
            .selectDistinct({ characterId: raidLogAttendeeMap.characterId })
            .from(raidLogAttendeeMap)
            .innerJoin(raidLogs, eq(raidLogAttendeeMap.raidLogId, raidLogs.raidLogId))
            .where(
              and(
                eq(raidLogs.raidId, raid.raidId),
                inArray(raidLogAttendeeMap.characterId, familyIds),
                eq(raidLogAttendeeMap.isIgnored, false),
              ),
            ),
          ctx.db
            .select({ characterId: raidBenchMap.characterId })
            .from(raidBenchMap)
            .where(
              and(
                eq(raidBenchMap.raidId, raid.raidId),
                inArray(raidBenchMap.characterId, familyIds),
              ),
            ),
        ]);

        const attendedIds = new Set(attendeeRows.map((r) => r.characterId));
        const benchIds = new Set(benchRows.map((r) => r.characterId));

        const status = (
          attendedIds.size > 0 ? "ATTENDED" : benchIds.size > 0 ? "BENCH" : "ABSENT"
        ) as "ATTENDED" | "BENCH" | "ABSENT";

        const attendees =
          attendedIds.size > 0
            ? await ctx.db
                .select()
                .from(characters)
                .where(inArray(characters.characterId, [...attendedIds]))
            : [];

        return { status, attendees };
      },
    }),
  }),
});

RaidLogRef.implement({
  fields: (t) => ({
    id: t.exposeString("raidLogId"),
    name: t.exposeString("name"),
    zone: t.exposeString("zone", { nullable: true }),
    kills: t.field({
      type: ["String"],
      resolve: (log) => log.kills,
    }),
    killCount: t.field({
      type: "Int",
      nullable: true,
      resolve: (log) => log.killCount,
    }),
    startTime: t.field({
      type: "String",
      nullable: true,
      resolve: (log) => log.startTimeUTC?.toISOString() ?? null,
    }),
    endTime: t.field({
      type: "String",
      nullable: true,
      resolve: (log) => log.endTimeUTC?.toISOString() ?? null,
    }),
    attendees: t.field({
      type: [RaidLogAttendeeRef],
      resolve: async (log, _args, ctx) => {
        requireUser(ctx);
        const rows = await ctx.db
          .select({
            characterId: raidLogAttendeeMap.characterId,
            isIgnored: raidLogAttendeeMap.isIgnored,
          })
          .from(raidLogAttendeeMap)
          .where(
            and(
              eq(raidLogAttendeeMap.raidLogId, log.raidLogId),
              eq(raidLogAttendeeMap.isIgnored, false),
            ),
          );
        if (rows.length === 0) return [];
        const charRows = await ctx.db
          .select()
          .from(characters)
          .where(
            inArray(
              characters.characterId,
              rows.map((r) => r.characterId),
            ),
          );
        return charRows.map((c) => ({ character: c, status: "ATTENDED" }));
      },
    }),
  }),
});

RaidLogAttendeeRef.implement({
  fields: (t) => ({
    character: t.field({
      type: CharacterRef,
      resolve: (attendee) => attendee.character,
    }),
    status: t.exposeString("status"),
  }),
});
