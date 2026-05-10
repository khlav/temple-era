// src/server/api/v2/types/user.ts
import { eq } from "drizzle-orm";
import { characters } from "~/server/db/schema";
import { builder } from "../builder";
import { CharacterRef } from "../refs";
import { requireUser } from "../context";

type UserData = {
  id: string;
  discordId: string;
  name: string | null;
  image: string | null;
  isRaidManager: boolean | null;
  isAdmin: boolean | null;
  characterId: number | null;
};

export const UserRef = builder.objectRef<UserData>("User");

UserRef.implement({
  fields: (t) => ({
    id: t.exposeID("id"),
    discordId: t.exposeString("discordId"),
    name: t.exposeString("name", { nullable: true }),
    image: t.exposeString("image", { nullable: true }),
    isRaidManager: t.field({
      type: "Boolean",
      nullable: true,
      resolve: (u) => u.isRaidManager,
    }),
    isAdmin: t.field({
      type: "Boolean",
      nullable: true,
      resolve: (u) => u.isAdmin,
    }),
    character: t.field({
      type: CharacterRef,
      nullable: true,
      resolve: async (u, _args, ctx) => {
        requireUser(ctx);
        if (!u.characterId) return null;
        const result = await ctx.db
          .select()
          .from(characters)
          .where(eq(characters.characterId, u.characterId))
          .limit(1);
        return result[0] ?? null;
      },
    }),
  }),
});

export type { UserData };
