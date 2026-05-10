// src/server/api/v2/types/character-family.ts
import { eq } from "drizzle-orm";
import { characters } from "~/server/db/schema";
import { CharacterFamilyRef, CharacterRef, RaidAttendanceRef } from "../refs";
import { RaidZoneEnum } from "./enums";
import { requireUser } from "../context";
import { computeAttendance } from "../helpers/attendance";

CharacterFamilyRef.implement({
  fields: (t) => ({
    primary: t.field({
      type: CharacterRef,
      resolve: async (family, _args, ctx) => {
        requireUser(ctx);
        const result = await ctx.db
          .select()
          .from(characters)
          .where(eq(characters.characterId, family.primaryCharacterId))
          .limit(1);
        if (!result[0]) throw new Error(`Primary character ${family.primaryCharacterId} not found`);
        return result[0];
      },
    }),
    secondaries: t.field({
      type: [CharacterRef],
      resolve: async (family, _args, ctx) => {
        requireUser(ctx);
        return ctx.db
          .select()
          .from(characters)
          .where(eq(characters.primaryCharacterId, family.primaryCharacterId));
      },
    }),
    attendance: t.field({
      type: [RaidAttendanceRef],
      args: {
        zones: t.arg({ type: [RaidZoneEnum], required: false }),
        from: t.arg.string({ required: false }),
        to: t.arg.string({ required: false }),
      },
      resolve: async (family, args, ctx) => {
        requireUser(ctx);
        const secondaries = await ctx.db
          .select({ characterId: characters.characterId })
          .from(characters)
          .where(eq(characters.primaryCharacterId, family.primaryCharacterId));
        const characterIds = [family.primaryCharacterId, ...secondaries.map((s) => s.characterId)];
        return computeAttendance({
          characterIds,
          zones: args.zones as string[] | null,
          from: args.from,
          to: args.to,
          db: ctx.db,
        });
      },
    }),
  }),
});
