import { z } from "zod";
import {
  createTRPCRouter,
  publicProcedure,
} from "~/server/api/trpc";
import anyAscii from "any-ascii";
import { characters } from "~/server/db/schema";
import {eq} from "drizzle-orm";

export const Slugify = (value: string) => { return anyAscii(value).toLowerCase(); };

export const characterRouter = createTRPCRouter({

  getCharacters: publicProcedure.query( async ({ ctx }) => {
    const characters = await ctx.db.query.characters.findMany({
      orderBy: (characters, { asc }) => [asc(characters.slug)],
      columns: {
        name: true,
        server: true,
        slug: true,
        class: true,
        characterId: true,
      },
    });
    return characters ?? null;
  }),

  getCharacterById: publicProcedure
    .input(z.number())
    .query( async ({ ctx, input }) => {
      const character = await ctx.db
        .select()
        .from(characters)
        .where(eq(characters.characterId, input))
      return character ?? null;
    }),

});