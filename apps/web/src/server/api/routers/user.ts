import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import {characters, users} from "~/server/db/schema";
import {eq, inArray} from "drizzle-orm";

export const user = createTRPCRouter({
  getUsers: adminProcedure.query(async ({ ctx }) => {
    return await ctx.db.query.users.findMany({
      orderBy: (users, { asc }) => [asc(users.name)],
      columns: {
        id: true,
        name: true,
        image: true,
        isAdmin: true,
      },
    });
  }),

  updateUserRole: adminProcedure
    .input(z.object({
      id: z.string(),
      isAdmin: z.boolean()
    }))
    .mutation(async ({ ctx, input }) => {
      // 1 - Remove all existing associations to the target primary
      return await ctx.db
        .update(users)
        .set({
          isAdmin: input.isAdmin,
        })
        .where(eq(users.id, input.id))
        .returning({ id: users.id, isAdmin: users.isAdmin});
    }),

});
