// src/server/api/v2/types/character.ts
import { eq } from "drizzle-orm";
import { characters } from "~/server/db/schema";
import { CharacterRef, RaidAttendanceRef } from "../refs";
import { RaidZoneEnum } from "./enums";
import { requireUser } from "../context";
import { computeAttendance } from "../helpers/attendance";

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
        let characterIds: number[];
        if (c.isPrimary) {
          const secondaries = await ctx.db
            .select({ characterId: characters.characterId })
            .from(characters)
            .where(eq(characters.primaryCharacterId, c.characterId));
          characterIds = [c.characterId, ...secondaries.map((s) => s.characterId)];
        } else {
          characterIds = [c.characterId];
        }
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
