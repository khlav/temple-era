"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { Pencil, Check, ChevronDown } from "lucide-react";
import { WOWHeadTooltips } from "~/components/misc/wowhead-tooltips";
import { SpellIcon } from "~/components/ui/spell-icon";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "~/components/ui/accordion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { usePersistedBooleanPreference } from "~/hooks/use-persisted-boolean-preference";
import { useToast } from "~/hooks/use-toast";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import { ProfessionGlyph } from "~/lib/profession-icons";
import { cn } from "~/lib/utils";

interface CharacterRecipesProps {
  character: RaidParticipant;
  showRecipeEditor?: boolean;
}

const WOWHEAD_SPELL_URL_BASE = "https://www.wowhead.com/classic/spell=";
const RECIPES_CARD_COOKIE = "temple_character_recipes_open";

// Tier modifiers ("Greater Agility" vs "Lesser Agility") are redundant once the amount is
// shown, and only ever prefix enchants — potions/elixirs like "Greater Arcane Elixir" or
// "Greater Fire Protection Potion" use "Greater" as part of the actual item name, so the
// strip is scoped to names that had the "Enchant " prefix to begin with.
const ENCHANT_MODIFIER_RE = /\b(Greater|Lesser|Major|Minor|Superior|Mighty)\s+/gi;

function formatRecipeName(recipeName: string, profession: string) {
  let name = recipeName;

  if (/^Enchant\s+/i.test(name)) {
    name = name
      .replace(/^Enchant\s+/i, "")
      .replace(ENCHANT_MODIFIER_RE, "")
      .replace(/\(([^)]+)\)/g, "$1")
      .replace(/\bMana Regeneration\b/i, "Mana Regen")
      .replace(/\bResistance\b/i, "Resist");
  }

  if (profession === "Alchemy") {
    name = name.replace(/\bProtection Potion\b/gi, "Prot. Potion");
  }

  if (profession === "Cooking") {
    name = name.replace(/\bChimaerok\b/gi, "Chim");
  }

  if (profession === "Engineering") {
    name = name.replace(/\bAccurascope\b/gi, "Scope");
  }

  return name;
}

function sortRecipesByDisplayName<T extends { recipe: string; profession: string }>(recipes: T[]) {
  return [...recipes].sort((a, b) =>
    formatRecipeName(a.recipe, a.profession).localeCompare(
      formatRecipeName(b.recipe, b.profession),
    ),
  );
}

export const CharacterRecipes = ({
  character,
  showRecipeEditor = false,
}: CharacterRecipesProps) => {
  const [isEditMode, setIsEditMode] = useState(false);
  const [isOpen, setIsOpen] = usePersistedBooleanPreference({
    cookieName: RECIPES_CARD_COOKIE,
    defaultValue: true,
  });
  // Optimistic overrides for in-flight toggles, keyed by recipeSpellId — lets the checkbox
  // and label flip instantly instead of waiting on the mutation + query invalidation round trip.
  const [optimisticKnown, setOptimisticKnown] = useState<Map<number, boolean>>(new Map());
  const { toast } = useToast();
  const characterId = character.characterId;

  // Fetch character-specific recipes for view mode (lightweight query)
  const { data: characterRecipesData, isLoading: characterRecipesLoading } =
    api.recipe.getRecipesForCharacter.useQuery(characterId, {
      enabled: !isEditMode,
    });

  // Fetch all recipes with character data only when in edit mode (heavier query)
  const { data: allRecipesWithCharacters, isLoading: allRecipesLoading } =
    api.recipe.getAllRecipesWithCharacters.useQuery(undefined, {
      enabled: isEditMode,
    });

  // Group recipes by profession for the character (from character-specific query)
  const characterRecipes = characterRecipesData;

  // Group all recipes by profession
  const recipesByProfession = allRecipesWithCharacters?.reduce(
    (acc, recipe) => {
      acc[recipe.profession] ??= [];
      // @ts-expect-error Should exist
      acc[recipe.profession].push(recipe);
      return acc;
    },
    {} as Record<string, typeof allRecipesWithCharacters>,
  );

  // Group character recipes by profession for view mode
  const characterRecipesByProfession = characterRecipes?.reduce(
    (acc, recipe) => {
      acc[recipe.profession] ??= [];
      // @ts-expect-error Should exist
      acc[recipe.profession].push(recipe);
      return acc;
    },
    {} as Record<string, typeof characterRecipes>,
  );

  // API mutations
  // Get utils for invalidating queries
  const utils = api.useUtils();

  // Drop a recipe's optimistic override once the mutation settles — by then either the
  // invalidated queries already reflect the change, or onError has reverted the UI.
  const clearOptimisticState = (recipeSpellId: number) => {
    setOptimisticKnown((prev) => {
      const next = new Map(prev);
      next.delete(recipeSpellId);
      return next;
    });
  };

  const addRecipeToCharacter = api.recipe.addRecipeToCharacter.useMutation({
    onError: (error) => {
      toast({
        title: "Failed to add recipe",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeRecipeFromCharacter = api.recipe.removeRecipeFromCharacter.useMutation({
    onError: (error) => {
      toast({
        title: "Failed to remove recipe",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Rapidly toggling the same recipe (check, then uncheck before the first request settles)
  // fires two concurrent mutations whose server responses can arrive in either order — without
  // sequencing, the persisted DB state can end up opposite the user's last click. Chaining each
  // recipe's mutations onto its own promise queue forces them to hit the server in click order,
  // and the sequence counter ensures only the settlement of the *latest* toggle clears the
  // optimistic override (an earlier, now-superseded settlement must not stomp on it).
  const pendingToggleRef = useRef<Map<number, Promise<unknown>>>(new Map());
  const latestToggleSeqRef = useRef<Map<number, number>>(new Map());

  // Rapidly toggling several DIFFERENT recipes used to invalidate getAllRecipesWithCharacters
  // once per toggle. React Query dedupes concurrent fetches for the same query, so a toggle that
  // fires while an earlier one's refetch is still in flight just piggybacks on that ALREADY-
  // in-flight request — one that was dispatched before this toggle's own write committed, so the
  // response it shares doesn't yet reflect this recipe's change. That toggle's own optimistic
  // override still got cleared the moment its mutation settled, so the checkbox would flash back
  // to its pre-toggle state until a later refetch finally caught up — the "fighting" flicker.
  // Fix: batch every toggle in a burst onto one shared invalidate, and have EVERY toggle in that
  // burst — not just whichever one triggers it — await that same settled refetch before clearing
  // its own optimistic override, so the override never disappears ahead of the data backing it.
  const activeToggleCountRef = useRef(0);
  const burstDeferredRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);

  function currentBurstDeferred() {
    burstDeferredRef.current ??= (() => {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    })();
    return burstDeferredRef.current;
  }

  // Check if a character knows a recipe
  const characterKnowsRecipe = (recipeSpellId: number) => {
    if (optimisticKnown.has(recipeSpellId)) {
      return optimisticKnown.get(recipeSpellId);
    }
    if (isEditMode) {
      // In edit mode, check against allRecipesWithCharacters
      return allRecipesWithCharacters?.some(
        (recipe) =>
          recipe.recipeSpellId === recipeSpellId &&
          recipe.characters.some((char) => char.characterId === characterId),
      );
    } else {
      // In view mode, check against character-specific recipes
      return characterRecipes?.some((recipe) => recipe.recipeSpellId === recipeSpellId);
    }
  };

  // Handle checkbox change
  const handleRecipeToggle = (recipeSpellId: number, isChecked: boolean) => {
    setOptimisticKnown((prev) => new Map(prev).set(recipeSpellId, isChecked));

    const seq = (latestToggleSeqRef.current.get(recipeSpellId) ?? 0) + 1;
    latestToggleSeqRef.current.set(recipeSpellId, seq);

    activeToggleCountRef.current += 1;
    const burst = currentBurstDeferred();

    // Mutation queue holds ONLY the server call, not the burst wait below — keeping them
    // separate is load-bearing. Toggling the same recipe twice within one burst (e.g. on,
    // then off, before the first settles) used to chain the second toggle's mutation onto
    // the first toggle's ENTIRE promise, burst wait included. The first toggle's burst wait
    // can only resolve once every toggle in the burst — including this queued second one —
    // has decremented activeToggleCountRef, but the second toggle's mutation (and thus its
    // decrement) was itself blocked behind that same wait: a deadlock. Chaining only the
    // mutation call here lets the second toggle's request fire as soon as the first's
    // request (not its burst wait) settles.
    const previousMutation = pendingToggleRef.current.get(recipeSpellId) ?? Promise.resolve();
    const mutationSettled = previousMutation
      .then(() =>
        isChecked
          ? addRecipeToCharacter.mutateAsync({ recipeSpellId, characterId })
          : removeRecipeFromCharacter.mutateAsync({ recipeSpellId, characterId }),
      )
      .catch(() => {
        // Already surfaced via the mutation's onError toast — just keep the queue moving.
      });
    pendingToggleRef.current.set(recipeSpellId, mutationSettled);

    void mutationSettled.finally(async () => {
      activeToggleCountRef.current -= 1;
      if (activeToggleCountRef.current === 0) {
        // Last toggle in this burst — clear the slot for the next burst before awaiting,
        // so a toggle that starts while this refetch is in flight begins its own burst
        // instead of piggybacking on this (about to be stale) one.
        burstDeferredRef.current = null;
        try {
          await Promise.all([
            utils.recipe.getAllRecipesWithCharacters.invalidate(),
            utils.recipe.getRecipesForCharacter.invalidate(characterId),
          ]);
        } finally {
          burst.resolve();
        }
      } else {
        await burst.promise;
      }
      if (latestToggleSeqRef.current.get(recipeSpellId) === seq) {
        clearOptimisticState(recipeSpellId);
      }
    });
  };

  // Handle clicking on recipe name in edit mode
  const handleRecipeClick = (recipeSpellId: number, event: React.MouseEvent) => {
    if (isEditMode) {
      event.preventDefault(); // Prevent navigation
      const isCurrentlyChecked = characterKnowsRecipe(recipeSpellId);
      handleRecipeToggle(recipeSpellId, !isCurrentlyChecked);
    }
  };

  const isLoading = (isEditMode && allRecipesLoading) || (!isEditMode && characterRecipesLoading);

  if (isLoading) {
    return <div className="py-8 text-center">Loading recipes...</div>;
  }

  return (
    <div className="w-full">
      <WOWHeadTooltips />
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2 pt-3">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left transition-colors hover:text-foreground"
                aria-label={isOpen ? "Collapse recipes" : "Expand recipes"}
              >
                <CardTitle className="text-sm font-semibold tracking-tight sm:text-[15px]">
                  Crafting & Rare Recipes
                </CardTitle>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    !isOpen && "-rotate-90",
                  )}
                />
              </button>
            </CollapsibleTrigger>
            {isOpen &&
              showRecipeEditor &&
              (isEditMode ? (
                <Button
                  variant="default"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsEditMode(false)}
                  aria-label="Done editing"
                >
                  <Check className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="link"
                  size="icon"
                  onClick={() => setIsEditMode(true)}
                  className="h-8 w-8 border border-primary"
                  aria-label="Edit recipes"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              ))}
          </CardHeader>
          <CollapsibleContent>
            <CardContent className={cn("pt-0")}>
              {isEditMode ? (
                <Accordion type="multiple" className="w-full">
                  {Object.entries(recipesByProfession ?? {}).map(([profession, recipes]) => (
                    <AccordionItem key={profession} value={profession}>
                      <AccordionTrigger className="text-sm">
                        <span className="flex items-center gap-2">
                          <ProfessionGlyph
                            profession={profession}
                            className="text-muted-foreground"
                          />
                          {profession}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="grid grid-cols-1 gap-y-2">
                          {sortRecipesByDisplayName(recipes).map((recipe) => {
                            const isKnown = characterKnowsRecipe(recipe.recipeSpellId);
                            return (
                              <div key={recipe.recipeSpellId} className="flex items-start gap-2">
                                <Checkbox
                                  id={`recipe-${recipe.recipeSpellId}`}
                                  checked={isKnown}
                                  onCheckedChange={(checked) =>
                                    handleRecipeToggle(recipe.recipeSpellId, checked as boolean)
                                  }
                                />
                                <SpellIcon spellId={recipe.recipeSpellId} />
                                <label
                                  htmlFor={`recipe-${recipe.recipeSpellId}`}
                                  className="min-w-0 flex-1 cursor-pointer text-sm leading-5"
                                >
                                  <Link
                                    href={`${WOWHEAD_SPELL_URL_BASE}${recipe.recipeSpellId}`}
                                    target="_blank"
                                    className="text-muted-foreground hover:underline"
                                    onClick={(e) => handleRecipeClick(recipe.recipeSpellId, e)}
                                  >
                                    {formatRecipeName(recipe.recipe, recipe.profession)}
                                  </Link>
                                </label>
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="space-y-4">
                  {characterRecipesByProfession &&
                  Object.entries(characterRecipesByProfession).length > 0 ? (
                    Object.entries(characterRecipesByProfession).map(([profession, recipes]) => (
                      <section key={profession} className="space-y-2">
                        <div className="flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                          <ProfessionGlyph profession={profession} size={14} />
                          {profession}
                        </div>
                        <div className="grid grid-cols-1 gap-y-1.5">
                          {sortRecipesByDisplayName(recipes).map((recipe) => (
                            <div
                              key={recipe.recipeSpellId}
                              className="flex min-w-0 items-center gap-2 text-sm leading-5"
                            >
                              <SpellIcon spellId={recipe.recipeSpellId} />
                              <div className="min-w-0">
                                <Link
                                  href={`${WOWHEAD_SPELL_URL_BASE}${recipe.recipeSpellId}`}
                                  target="_blank"
                                  className="text-muted-foreground hover:underline"
                                >
                                  {formatRecipeName(recipe.recipe, recipe.profession)}
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))
                  ) : (
                    <div className="py-4 text-center text-muted-foreground">
                      No crafting recipes found for this character.
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
};
