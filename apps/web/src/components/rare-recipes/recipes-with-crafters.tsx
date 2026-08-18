"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import Link from "next/link";
import { X } from "lucide-react";
import { WOWHeadTooltips } from "~/components/misc/wowhead-tooltips";
import { TableSearchInput } from "~/components/ui/table-search-input";
import { TableSearchTips } from "~/components/ui/table-search-tips";
import { SearchSyntaxTips } from "~/components/ui/search-syntax-tips";
import { matchesSearchQuery } from "~/lib/table-search";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { StatsCounter } from "~/components/rare-recipes/stats-counter";
import { CraftersSummaryMessage } from "~/components/rare-recipes/crafters-summary-message";
import { Checkbox } from "~/components/ui/checkbox";
import { SpellIcon } from "~/components/ui/spell-icon";
import type { RecipeWithCharacters } from "~/server/api/interfaces/recipe";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { useIsMobile } from "~/hooks/use-mobile";
import { VirtualizedList } from "~/components/ui/virtualized-list";
import { CrafterList } from "~/components/rare-recipes/crafter-list";
import { FilterRail, type FilterRailItem } from "~/components/ui/filter-rail";
import { ProfessionGlyph } from "~/lib/profession-icons";
import { cn } from "~/lib/utils";

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
  "#caster|#healer Bloodvine",
];

// Schema order (recipe-schema.ts professionEnum) — also the rail's display order.
const PROFESSION_ORDER = [
  "Alchemy",
  "Blacksmithing",
  "Enchanting",
  "Engineering",
  "Tailoring",
  "Leatherworking",
  "Cooking",
];

const GRID_COLS = "grid-cols-[minmax(0,1.7fr)_56px_minmax(0,1.3fr)_98px]";

export const RecipesWithCrafters = () => {
  const isMobile = useIsMobile();
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
  const [searchInputKey, setSearchInputKey] = useState(0);
  const [placeholderSearch, setPlaceholderSearch] = useState<string>("");
  const [searchPerformed, setSearchPerformed] = useState<boolean>(!!initialSearch);
  const [showInactiveCharacters, setShowInactiveCharacters] = useState<boolean>(false);
  const [selectedProfession, setSelectedProfession] = useState<string>("all");

  useEffect(() => {
    setPlaceholderSearch(SAMPLE_SEARCHES[Math.floor(Math.random() * SAMPLE_SEARCHES.length)] ?? "");
  }, [searchTerms]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

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

  const professionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of recipes ?? []) counts[r.profession] = (counts[r.profession] ?? 0) + 1;
    return counts;
  }, [recipes]);

  const railItems: FilterRailItem[] = useMemo(
    () => [
      {
        id: "all",
        label: "All professions",
        count: recipes?.length ?? 0,
        icon: <ProfessionGlyph profession="All" />,
      },
      ...PROFESSION_ORDER.map((profession) => ({
        id: profession,
        label: profession,
        count: professionCounts[profession] ?? 0,
        icon: <ProfessionGlyph profession={profession} />,
      })),
    ],
    [recipes, professionCounts],
  );

  const professionFilteredRecipes = useMemo(() => {
    if (!recipes || selectedProfession === "all") return recipes;
    return recipes.filter((r) => r.profession === selectedProfession);
  }, [recipes, selectedProfession]);

  // Filter function for recipes with exclusion support and inactive character filtering
  const filteredRecipes: RecipeWithCharacters[] =
    professionFilteredRecipes
      ?.filter((recipe) => {
        if (!searchTerms.trim()) return true;

        const searchableString = [
          recipe.recipe,
          recipe.profession,
          recipe.isCommon ? "common most crafters" : "",
          recipe.tags?.map((tag) => "#" + tag).join(" ") ?? "",
          recipe.characters?.map((c) => c.name).join(" ") ?? "",
          recipe.notes ?? "",
        ].join(" ");

        return matchesSearchQuery(searchableString, searchTerms);
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
      }))
      .sort((a, b) => a.recipe.localeCompare(b.recipe, undefined, { sensitivity: "base" })) ?? [];

  // Function to handle tag click and update search
  const handleTagClick = (tag: string, exclude = false) => {
    const prefix = exclude ? "-" : "";
    const termToAdd = `${prefix}${tag}`;

    // Check if the tag is already in the search terms
    const currentTerms = searchTerms.split(/\s+/);

    // If tag is not already in search terms, add it
    if (!currentTerms.includes(termToAdd)) {
      setSearchTerms((prev) => {
        const nextValue = prev ? `${prev} ${termToAdd}` : termToAdd;
        setSearchInputKey((key) => key + 1);
        return nextValue;
      });
    }
  };

  // Function to handle tag right-click for exclusion
  const handleTagRightClick = (tag: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent default context menu
    handleTagClick(tag, true);
    return false;
  };

  const activeTokens = searchTerms.trim() ? searchTerms.trim().split(/\s+/).filter(Boolean) : [];

  const removeToken = (token: string) => {
    const nextValue = activeTokens.filter((t) => t !== token).join(" ");
    setSearchTerms(nextValue);
    setSearchInputKey((key) => key + 1);
  };

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="flex w-full shrink-0 flex-col gap-3 lg:w-[208px]">
        <FilterRail
          heading="Profession"
          items={railItems}
          activeId={selectedProfession}
          onSelect={setSelectedProfession}
        />
        {isSuccess && <StatsCounter filteredRecipes={filteredRecipes} />}
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <TableSearchInput
              key={searchInputKey}
              ref={searchInputRef}
              type="text"
              placeholder={
                placeholderSearch
                  ? `Search recipes, tags, or crafters... (e.g. ${placeholderSearch})`
                  : "Search recipes, tags, or crafters..."
              }
              defaultValue={searchTerms}
              onDebouncedChange={(v) => setSearchTerms(v ?? "")}
              isLoading={isLoading}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            <div className="font-display flex h-11 items-center rounded-xl border border-border/80 bg-card/70 px-3.5 text-[13px] text-muted-foreground">
              {filteredRecipes.length} matches
            </div>
            <TableSearchTips>
              <p className="mb-1 font-medium">Search tips:</p>
              <ul className="mb-1 list-disc space-y-1 pl-4">
                <li>
                  Use <span className="font-mono text-chart-3">#tag</span> to search by tag
                </li>
                <li>Click tags to add them to your search</li>
              </ul>
              <SearchSyntaxTips />
            </TableSearchTips>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTokens.map((token) => {
            const isTag = token.startsWith("#");
            return (
              <span
                key={token}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
                  isTag
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border/80 text-muted-foreground",
                )}
              >
                {token}
                <button
                  type="button"
                  aria-label={`Remove ${token}`}
                  onClick={() => removeToken(token)}
                  className="text-current/70 hover:text-current"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <Checkbox
              id="show-inactive"
              checked={showInactiveCharacters}
              onCheckedChange={(checked) => setShowInactiveCharacters(checked === true)}
              className="rounded-[4px] border-muted-foreground/50 data-[state=checked]:border-primary/50 data-[state=checked]:bg-primary/25 data-[state=checked]:text-foreground"
            />
            <label
              htmlFor="show-inactive"
              className="whitespace-nowrap text-sm leading-none text-muted-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Show inactive characters
            </label>
          </div>
        </div>

        {/* Scrollable content area */}
        <div>
          <div className="space-y-4">
            {isLoading && (
              <div className="py-4 text-center text-gray-500 dark:text-gray-400">
                Loading recipes...
              </div>
            )}

            {/* Crafters Summary Message - Shows when specific conditions are met */}
            {isSuccess && (
              <CraftersSummaryMessage
                filteredRecipes={filteredRecipes}
                searchPerformed={searchPerformed}
              />
            )}

            {isSuccess && (
              <div className="space-y-3">
                {isMobile ? (
                  <VirtualizedList
                    items={filteredRecipes}
                    itemKey={(recipe) => recipe.recipeSpellId}
                    estimateItemHeight={188}
                    overscan={4}
                    className="panel-subtle h-[min(68svh,44rem)] rounded-2xl border border-border/70 p-3"
                    innerClassName="pr-1"
                    emptyState={
                      <div className="rounded-2xl border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                        No recipes found matching your search
                      </div>
                    }
                    renderItem={(recipe) => (
                      <div className="pb-3">
                        <Card>
                          <CardContent className="space-y-3 p-4">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="gap-1.5">
                                  <ProfessionGlyph profession={recipe.profession} size={13} />
                                  {recipe.profession}
                                </Badge>
                                {recipe.isCommon ? (
                                  <Badge variant="secondary">Most crafters</Badge>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <SpellIcon spellId={recipe.recipeSpellId} />
                                <Link
                                  href={WOWHEAD_SPELL_URL_BASE + recipe.recipeSpellId}
                                  className="min-w-0 text-base font-semibold hover:underline"
                                  target="_blank"
                                >
                                  {recipe.recipe}
                                </Link>
                              </div>
                              {recipe.notes ? (
                                <p className="text-sm text-muted-foreground">{recipe.notes}</p>
                              ) : null}
                            </div>

                            {recipe.tags?.length ? (
                              <div className="flex flex-wrap gap-2">
                                {recipe.tags?.map((tag, index) => (
                                  <Button
                                    key={index}
                                    variant="secondary"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => handleTagClick(`#${tag}`)}
                                    onContextMenu={(e) => handleTagRightClick(`#${tag}`, e)}
                                  >
                                    #{tag}
                                  </Button>
                                ))}
                              </div>
                            ) : null}

                            {!recipe.isCommon ? (
                              <CrafterList
                                characters={recipe.characters ?? []}
                                showInactiveCharacters={showInactiveCharacters}
                              />
                            ) : null}
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  />
                ) : (
                  <div className="panel-subtle flex h-[calc(100vh-260px)] min-h-[480px] flex-col overflow-hidden rounded-2xl border border-border/70">
                    <WOWHeadTooltips />
                    <div
                      className={cn(
                        "grid shrink-0 items-center gap-3.5 border-b border-border/70 bg-card/80 px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground",
                        GRID_COLS,
                      )}
                    >
                      <div>Recipe</div>
                      <div>Prof.</div>
                      <div>Crafters</div>
                      <div>Tags</div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {filteredRecipes.length === 0 && (
                        <div className="flex h-full items-center justify-center px-4 py-8 text-center text-sm text-muted-foreground">
                          No recipes found matching your search
                        </div>
                      )}
                      {filteredRecipes.map((recipe) => (
                        <div
                          key={recipe.recipeSpellId}
                          className={cn(
                            "grid items-center gap-3.5 border-b border-border/45 px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-accent/35",
                            GRID_COLS,
                          )}
                        >
                          <div className="flex min-w-0 items-start gap-1.5">
                            <SpellIcon
                              spellId={recipe.recipeSpellId}
                              size={recipe.notes ? 36 : 18}
                            />
                            <div className="min-w-0">
                              <Link
                                href={WOWHEAD_SPELL_URL_BASE + recipe.recipeSpellId}
                                className="hover:underline"
                                target="_blank"
                              >
                                {recipe.recipe}
                              </Link>
                              {recipe.notes ? (
                                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground text-pretty">
                                  {recipe.notes}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div
                            title={recipe.profession}
                            className="flex items-center justify-center text-muted-foreground"
                          >
                            <ProfessionGlyph profession={recipe.profession} size={22} />
                          </div>
                          <div className="min-w-0">
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
                              <CrafterList
                                characters={recipe.characters ?? []}
                                showInactiveCharacters={showInactiveCharacters}
                              />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {recipe.tags?.map((tag, index) => (
                              <Button
                                key={index}
                                variant="link"
                                size="sm"
                                className="h-3 border-0 bg-transparent p-0 text-xs font-normal text-muted-foreground opacity-70 transition-all duration-100 hover:opacity-100"
                                onClick={() => handleTagClick(`#${tag}`)}
                                onContextMenu={(e) => handleTagRightClick(`#${tag}`, e)}
                              >
                                #{tag}
                              </Button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
