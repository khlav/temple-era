import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { users } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { encryptToken } from "~/server/api/token-crypto";

export const profile = createTRPCRouter({
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.query.users.findFirst({
      orderBy: (users, { asc }) => [asc(users.id)],
      columns: {
        name: true,
        characterId: true,
        image: true,
        isRaidManager: true,
        isAdmin: true,
        apiToken: true,
        templarEnabled: true,
      },
      with: {
        character: {
          columns: {
            name: true,
            characterId: true,
            class: true,
            primaryCharacterId: true,
          },
          with: {
            primaryCharacter: {
              columns: {
                characterId: true,
              },
              with: {
                secondaryCharacters: {
                  columns: {
                    characterId: true,
                  },
                },
              },
            },
            secondaryCharacters: {
              columns: {
                characterId: true,
              },
            },
          },
        },
      },
      where: eq(users.id, ctx.session.user.id),
    });

    if (!user) {
      return {
        name: "",
        characterId: -1,
        image: "",
        isRaidManager: false,
        isAdmin: false,
        hasApiToken: false,
        templarEnabled: false,
        character: { name: "", characterId: -1, class: "" },
        userCharacterIds: [],
      };
    }

    // Calculate all character IDs belonging to this user
    const userCharacterIds = new Set<number>();

    if (user.character) {
      userCharacterIds.add(user.character.characterId);

      // If linked to a primary, add the primary and all its secondaries (siblings)
      if (user.character.primaryCharacter) {
        userCharacterIds.add(user.character.primaryCharacter.characterId);
        user.character.primaryCharacter.secondaryCharacters.forEach((char) =>
          userCharacterIds.add(char.characterId),
        );
      }

      // If this IS a primary, add all its secondaries (children)
      user.character.secondaryCharacters.forEach((char) => userCharacterIds.add(char.characterId));
    }

    return {
      ...user,
      apiToken: undefined,
      hasApiToken: user.apiToken !== null,
      templarEnabled: user.templarEnabled ?? false,
      userCharacterIds: Array.from(userCharacterIds),
    };
  }),

  saveMyProfile: protectedProcedure
    .input(
      z.object({
        name: z.string(),
        characterId: z.number().nullish(),
      }),
    )
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
    }),

  generateApiToken: protectedProcedure.mutation(async ({ ctx }) => {
    const { isRaidManager, isAdmin } = ctx.session.user;
    // Uses protectedProcedure + manual guard (not raidManagerProcedure) because token
    // generation should be available to both raid managers and admins, and no existing
    // middleware covers that union.
    if (!isRaidManager && !isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only raid managers and admins can generate API tokens.",
      });
    }

    // Check if user already had a token (so UI can warn about invalidating it)
    const existing = await ctx.db.query.users.findFirst({
      columns: { apiToken: true },
      where: eq(users.id, ctx.session.user.id),
    });
    const replaced = existing?.apiToken !== null && existing?.apiToken !== undefined;

    const token = `tera_${crypto.randomBytes(16).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const tokenEncrypted = encryptToken(token);

    await ctx.db
      .update(users)
      .set({ apiToken: tokenHash, apiTokenEncrypted: tokenEncrypted })
      .where(eq(users.id, ctx.session.user.id));

    return { token, replaced };
  }),

  revokeApiToken: protectedProcedure.mutation(async ({ ctx }) => {
    const { isRaidManager, isAdmin } = ctx.session.user;
    if (!isRaidManager && !isAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only raid managers and admins can manage API tokens.",
      });
    }

    await ctx.db
      .update(users)
      .set({ apiToken: null, apiTokenEncrypted: null })
      .where(eq(users.id, ctx.session.user.id));

    return { success: true };
  }),

  setTemplarEnabled: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { isRaidManager, isAdmin } = ctx.session.user;
      if (!isRaidManager && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only raid managers and admins can manage Templar access.",
        });
      }
      await ctx.db
        .update(users)
        .set({ templarEnabled: input.enabled })
        .where(eq(users.id, ctx.session.user.id));
      return { templarEnabled: input.enabled };
    }),
});
