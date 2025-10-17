"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import Link from "next/link";
import { WOWHeadTooltips } from "~/components/misc/wowhead-tooltips";
import { Search } from "lucide-react";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { Button } from "~/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { StatsCounter } from "~/components/rare-recipes/stats-counter";
// import { SearchHelperText } from "~/components/rare-recipes/search-helper-text";
import { CraftersSummaryMessage } from "~/components/rare-recipes/crafters-summary-message";
import { Checkbox } from "~/components/ui/checkbox";
import type { RecipeWithCharacters } from "~/server/api/interfaces/recipe";

const SAMPLE_SEARCHES = [
  "#natureresist Tailoring",
  "#caster Bloodvine -green",
  "#tank #melee Enchanting -weapon",
  "Glacial #healer -blue",
  "#ranged Engineering -scope",
  "#shield Biznicks -gnomish",
  "Runed Stygian #aq40 -tailoring",
  "#qol Bottomless -enchanting",
  "Brilliant Oil #caster -drake",
  "#chest #naxx -leather",
];

export const RecipesWithCrafters = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get("s") ?? "";
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    data: recipes,
    isLoading,
    isSuccess,
  } = api.recipe.getAllRecipesWithCharacters.useQuery<RecipeWithCharacters[]>();
  const WOWHEAD_SPELL_URL_BASE = "https://www.wowhead.com/classic/spell=";

  const [searchTerms, setSearchTerms] = useState<string>(initialSearch);
  const [placeholderSearch, setPlaceholderSearch] = useState<string>("");
  // Track if a search has been performed
  const [searchPerformed, setSearchPerformed] =
    useState<boolean>(!!initialSearch);
  // Track whether to show inactive characters
  const [showInactiveCharacters, setShowInactiveCharacters] =
    useState<boolean>(false);

  useEffect(() => {
    setPlaceholderSearch(
      SAMPLE_SEARCHES[Math.floor(Math.random() * SAMPLE_SEARCHES.length)] ?? "",
    );
  }, [searchTerms]);

  // Focus search input on component mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Update URL when search changes and track search performed state
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());

    if (searchTerms) {
      params.set("s", searchTerms);
      setSearchPerformed(true);
    } else {
      params.delete("s");
      setSearchPerformed(false);
    }

    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchTerms, router, searchParams]);

  // Filter function for recipes with exclusion support and inactive character filtering
  const filteredRecipes: RecipeWithCharacters[] =
    recipes
      ?.filter((recipe) => {
        // Apply search filtering if search terms exist
        if (!searchTerms.trim()) return true;

        // Split search terms and convert to lowercase
        const allTerms = searchTerms.toLowerCase().split(/\s+/);

        // Separate inclusion and exclusion terms
        const includeTerms = allTerms.filter((term) => !term.startsWith("-"));
        const excludeTerms = allTerms
          .filter((term) => term.startsWith("-"))
          .map((term) => term.substring(1)); // Remove the '-' prefix

        // Convert recipe details to searchable string
        const searchableString = [
          recipe.recipe.toLowerCase(),
          recipe.profession.toLowerCase(),
          recipe.isCommon ? "common most crafters" : "",
          recipe.tags
            ?.map((tag) => "#" + tag)
            .join(" ")
            .toLowerCase() ?? "",
          recipe.characters?.map((c) => c.name?.toLowerCase()).join(" ") || "",
          (recipe.notes ?? "").toLowerCase(),
        ].join(" ");

        // Check if ANY exclusion term is present (if so, exclude this recipe)
        if (
          excludeTerms.some((term) => term && searchableString.includes(term))
        ) {
          return false;
        }

        // If no inclusion terms, all non-excluded items match
        if (includeTerms.length === 0) {
          return true;
        }

        // Check if ALL inclusion terms are present
        return includeTerms.every((term) => searchableString.includes(term));
      })
      .map((recipe) => ({
        ...recipe,
        characters:
          recipe.characters?.filter((character) => {
            if (showInactiveCharacters) {
              return true; // Show all characters
            }
            return character.isActiveRaider; // Only show active characters
          }) ?? [],
      })) ?? [];

  // Function to handle tag click and update search
  const handleTagClick = (tag: string, exclude = false) => {
    const prefix = exclude ? "-" : "";
    const termToAdd = `${prefix}${tag}`;

    // Check if the tag is already in the search terms
    const currentTerms = searchTerms.split(/\s+/);

    // If tag is not already in search terms, add it
    if (!currentTerms.includes(termToAdd)) {
      setSearchTerms((prev) => (prev ? `${prev} ${termToAdd}` : termToAdd));
    }
  };

  // Function to handle tag right-click for exclusion
  const handleTagRightClick = (tag: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default context menu
    handleTagClick(tag, true);
    return false;
  };

  return (
    <div className="w-full space-y-2">
      {/* Search Input - Fixed at top */}
      <div className="space-y-1">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={20}
          />
          <TableSearchInput
            ref={searchInputRef}
            type="text"
            placeholder={
              placeholderSearch
                ? `Search recipes, professions, tags, or characters... (e.g. ${placeholderSearch})`
                : "Search recipes, professions, tags, or characters..."
            }
            className="w-full pl-10"
            initialValue={initialSearch}
            onDebouncedChange={(v) => setSearchTerms(v ?? "")}
            isLoading={isLoading}
          />
        </div>
        <div className="flex items-center justify-between">
          <TableSearchTips>
            <p className="mb-1 font-medium">Search tips:</p>
            <ul className="list-disc space-y-1 pl-4">
              <li>Type multiple terms to match ALL terms</li>
              <li>
                Use <span className="font-mono text-chart-3">#tag</span> to
                search by tag
              </li>
              <li>
                Use <span className="font-mono text-chart-3">-term</span> to
                exclude (e.g.{" "}
                <span className="font-mono text-chart-3">-leather</span>)
              </li>
              <li>Click tags or crafter names to add them to your search</li>
            </ul>
          </TableSearchTips>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-inactive"
              checked={showInactiveCharacters}
              onCheckedChange={(checked) =>
                setShowInactiveCharacters(checked === true)
              }
              className="border-muted-foreground/50 data-[state=checked]:border-muted-foreground/50 data-[state=checked]:bg-muted-foreground/30 data-[state=checked]:text-foreground"
            />
            <label
              htmlFor="show-inactive"
              className="text-sm leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Show Inactive Characters
            </label>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
        <div className="space-y-4">
          {isLoading && (
            <div className="py-4 text-center text-gray-500 dark:text-gray-400">
              Loading recipes...
            </div>
          )}

          {/* Stats Counter - Only show when data is loaded */}
          {isSuccess && <StatsCounter filteredRecipes={filteredRecipes} />}

          {/* Crafters Summary Message - Shows when specific conditions are met */}
          {isSuccess && (
            <CraftersSummaryMessage
              filteredRecipes={filteredRecipes}
              searchPerformed={searchPerformed}
            />
          )}

          {isSuccess && (
            <div className="relative w-full">
              <WOWHeadTooltips />
              <table className="w-full caption-bottom text-sm">
                <thead className="sticky top-0 z-10 border-b bg-background [&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                      Recipe
                    </th>
                    <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell">
                      Profession
                    </th>
                    <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
                      Crafters
                    </th>
                    <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell">
                      Tags
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {filteredRecipes.map((recipe) => (
                    <tr
                      key={recipe.recipeSpellId}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      <td className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        <div>
                          <Link
                            href={WOWHEAD_SPELL_URL_BASE + recipe.recipeSpellId}
                            className="hover:underline"
                            target="_blank"
                          >
                            {recipe.recipe}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {recipe.notes}
                        </div>
                      </td>
                      <td className="hidden p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        {recipe.profession}
                      </td>
                      <td className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        <div className="my-auto flex flex-wrap gap-1">
                          {recipe.isCommon ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="text-nowrap text-xs italic text-chart-2">
                                  Most crafters
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="bg-secondary text-muted-foreground">
                                Trainable or very common drop
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            recipe.characters?.map((character) => (
                              <Button
                                variant="secondary"
                                key={character.characterId}
                                className={`bg-secondary px-2 py-1 text-xs text-secondary-foreground transition-all duration-100 hover:opacity-100 ${
                                  !character.isActiveRaider &&
                                  showInactiveCharacters
                                    ? "opacity-40"
                                    : "opacity-70"
                                }`}
                                onClick={() => handleTagClick(character.name)}
                                onContextMenu={(e) =>
                                  handleTagRightClick(character.name, e)
                                }
                              >
                                {character.name}
                              </Button>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="hidden p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        <div className="flex flex-wrap gap-1.5">
                          {recipe.tags?.map((tag, index) => (
                            <Button
                              key={index}
                              variant="link"
                              size="sm"
                              className="h-3 p-0 text-xs font-normal text-muted-foreground opacity-70 transition-all duration-100 hover:opacity-100"
                              onClick={() => handleTagClick(`#${tag}`)}
                              onContextMenu={(e) =>
                                handleTagRightClick(`#${tag}`, e)
                              }
                            >
                              #{tag}
                            </Button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredRecipes.length === 0 && (
                <div className="py-4 text-center text-muted-foreground">
                  No recipes found matching your search
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
