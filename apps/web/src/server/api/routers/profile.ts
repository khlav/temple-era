import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {raids, users} from "~/server/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import type {Raid} from "~/server/api/interfaces/raid";

export const profile = createTRPCRouter({
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      orderBy: (users, { asc }) => [asc(users.id)],
      columns: {
        name: true,
        characterId: true,
        image: true,
      },
      with: {
        character: {
          columns: {
            name: true,
            characterId: true,
          },
        },
      },
      where: eq(users.id, ctx.session.user.id),
    });
    return (
      user ?? {
        name: "",
        characterId: -1,
        image: "",
        character: { name: "", characterId: -1 },
      }
    );
  }),

  saveMyProfile: protectedProcedure
    .input(z.object({
      name: z.string(),
      characterId: z.number().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const currentUser = ctx.session.user;
      await ctx.db
        .update(users)
        .set({
          name: input.name,
          characterId: input.characterId,
        })
        .where(eq(users.id, currentUser.id))
        .returning({
          name: users.name,
          characterId: users.characterId,
        });
    })
});
