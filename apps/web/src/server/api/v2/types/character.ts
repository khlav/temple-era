// src/server/api/v2/types/character.ts
import { eq } from "drizzle-orm";
import { type db as dbType } from "~/server/db";
import { characters } from "~/server/db/schema";
import { CharacterRef, RaidAttendanceRef, type CharacterRow } from "../refs";
import { RaidZoneEnum } from "./enums";
import { requireUser } from "../context";
import {
  computeAttendance,
  computeAttendedCount,
  computeEarliestAttendance,
} from "../helpers/attendance";

/** Resolves the set of character IDs representing a character's own attendance,
 *  or its full family (primary + all secondaries) when `includeFamily` is set. */
async function resolveCharacterIds(
  character: CharacterRow,
  includeFamily: boolean,
  db: typeof dbType,
): Promise<number[]> {
  if (!includeFamily) {
    if (!character.isPrimary) return [character.characterId];
    const secondaries = await db
      .select({ characterId: characters.characterId })
      .from(characters)
      .where(eq(characters.primaryCharacterId, character.characterId));
    return [character.characterId, ...secondaries.map((s) => s.characterId)];
  }

  const primaryCharacterId = character.isPrimary
    ? character.characterId
    : (character.primaryCharacterId ?? character.characterId);
  const secondaries = await db
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(eq(characters.primaryCharacterId, primaryCharacterId));
  return [primaryCharacterId, ...secondaries.map((s) => s.characterId)];
}

CharacterRef.implement({
  fields: (t) => ({
    id: t.exposeInt("characterId"),
    name: t.exposeString("name"),
    class: t.exposeString("class"),
    classDetail: t.exposeString("classDetail"),
    server: t.exposeString("server"),
    slug: t.exposeString("slug"),
    isPrimary: t.field({
      type: "Boolean",
      nullable: true,
      resolve: (c) => c.isPrimary,
    }),
    primaryCharacter: t.field({
      type: CharacterRef,
      nullable: true,
      resolve: async (c, _args, ctx) => {
        requireUser(ctx);
        if (!c.primaryCharacterId) return null;
        const result = await ctx.db
          .select()
          .from(characters)
          .where(eq(characters.characterId, c.primaryCharacterId))
          .limit(1);
        return result[0] ?? null;
      },
    }),
    secondaries: t.field({
      type: [CharacterRef],
      resolve: async (c, _args, ctx) => {
        requireUser(ctx);
        return ctx.db
          .select()
          .from(characters)
          .where(eq(characters.primaryCharacterId, c.characterId));
      },
    }),
    attendance: t.field({
      type: [RaidAttendanceRef],
      args: {
        zones: t.arg({ type: [RaidZoneEnum], required: false }),
        from: t.arg.string({ required: false }),
        to: t.arg.string({ required: false }),
      },
      resolve: async (c, args, ctx) => {
        requireUser(ctx);
        // For a primary character, aggregate across self + all secondaries
        // For a secondary character, only count this character's own attendance
        const characterIds = await resolveCharacterIds(c, false, ctx.db);
        return computeAttendance({
          characterIds,
          zones: args.zones as string[] | null,
          from: args.from,
          to: args.to,
          db: ctx.db,
        });
      },
    }),
    earliestAttendance: t.field({
      type: RaidAttendanceRef,
      nullable: true,
      args: {
        zones: t.arg({ type: [RaidZoneEnum], required: false }),
        from: t.arg.string({ required: false }),
        to: t.arg.string({ required: false }),
      },
      resolve: async (c, args, ctx) => {
        requireUser(ctx);
        const characterIds = await resolveCharacterIds(c, false, ctx.db);
        return computeEarliestAttendance({
          characterIds,
          zones: args.zones as string[] | null,
          from: args.from,
          to: args.to,
          db: ctx.db,
        });
      },
    }),
    attendedCount: t.field({
      type: "Int",
      nullable: false,
      args: {
        zones: t.arg({ type: [RaidZoneEnum], required: false }),
        from: t.arg.string({ required: false }),
        to: t.arg.string({ required: false }),
        includeBench: t.arg.boolean({ required: true, defaultValue: true }),
        includeFamily: t.arg.boolean({ required: true, defaultValue: false }),
      },
      resolve: async (c, args, ctx) => {
        requireUser(ctx);
        const characterIds = await resolveCharacterIds(c, args.includeFamily, ctx.db);
        return computeAttendedCount({
          characterIds,
          zones: args.zones as string[] | null,
          from: args.from,
          to: args.to,
          includeBench: args.includeBench,
          db: ctx.db,
        });
      },
    }),
  }),
});
