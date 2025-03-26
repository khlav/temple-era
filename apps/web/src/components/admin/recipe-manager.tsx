"use client"

import { api } from "~/trpc/react";
import Link from "next/link";
import { WOWHeadTooltips } from "~/components/misc/wowhead-tooltips";
import { CheckCircle2 } from "lucide-react";

export const RecipeManager = () => {
  const { data: recipes, isLoading, isSuccess } = api.recipe.getAllRecipes.useQuery();
  const WOWHEAD_SPELL_URL_BASE = "https://www.wowhead.com/classic/spell=";

  return (
    <div className="w-full">
      {isLoading && (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading recipes...</div>
      )}

      {isSuccess && (
        <div className="overflow-x-auto">
          <WOWHeadTooltips />
          <table className="w-full border-collapse text-sm">
            <thead>
            <tr className="bg-secondary ">
              <th className="p-3 text-left bg-secondary text-secondary-foreground font-semibold">Recipe</th>
              <th className="p-3 text-left bg-secondary text-secondary-foreground font-semibold">Profession</th>
              <th className="p-3 text-center bg-secondary text-secondary-foreground font-semibold">Is Common?</th>
              <th className="p-3 text-left bg-secondary text-secondary-foreground font-semibold">Tags</th>
            </tr>
            </thead>
            <tbody>
            {recipes.map((recipe) => (
              <tr
                key={recipe.recipeSpellId}
                className="border-b "
              >
                <td className="p-3">
                  <Link
                    href={WOWHEAD_SPELL_URL_BASE + recipe.recipeSpellId}
                    className="hover:underline"
                    target="_blank"
                  >
                    {recipe.recipe}
                  </Link>
                </td>
                <td className="p-3">{recipe.profession}</td>
                <td className="p-3 text-center">
                  {recipe.isCommon && (
                    <CheckCircle2
                      className="text-green-500 dark:text-green-400 mx-auto"
                      size={20}
                    />
                  )}
                </td>
                <td className="p-3">
                  <div className="flex flex-wrap gap-1">
                    {recipe.tags?.map((tag, index) => (
                      <span
                        key={index}
                        className="bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-full"
                      >
                          #{tag}
                        </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}