import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { users } from "~/server/db/schema";
import { eq } from "drizzle-orm";

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
      user.character.secondaryCharacters.forEach((char) =>
        userCharacterIds.add(char.characterId),
      );
    }

    return {
      ...user,
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
});
