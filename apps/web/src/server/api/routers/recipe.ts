import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { GetWOWClassicRecipeSearchResults } from "~/server/api/bnet-helpers";
import type { WOWClassicItemSearchAPIResponse } from "~/server/api/interfaces/wow";

export const recipe = createTRPCRouter({
  getRecipeSearchResults: adminProcedure
    .input(z.coerce.string())
    .query(async ({ ctx, input }) => {
      const rawResult = await GetWOWClassicRecipeSearchResults(input);
      return (await rawResult.json()) as WOWClassicItemSearchAPIResponse;
    }),
});
