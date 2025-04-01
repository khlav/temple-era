"use client"

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "~/trpc/react";
import Link from "next/link";
import { WOWHeadTooltips } from "~/components/misc/wowhead-tooltips";
import { Search } from "lucide-react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

const SAMPLE_SEARCHES = [
  "#natureresist Tailoring",
  "#caster Bloodvine",
  "#tank #melee Enchanting",
  "Glacial #healer",
  "#ranged Engineering",
  "#shield Biznicks",
  "Runed Stygian #aq40",
  "#qol Bottomless",
  "Brilliant Oil #caster",
  "#chest #naxx "
];

export const RecipesWithCrafters = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams?.get('s') ?? '';
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: recipes, isLoading, isSuccess } = api.recipe.getAllRecipesWithCharacters.useQuery();
  const WOWHEAD_SPELL_URL_BASE = "https://www.wowhead.com/classic/spell=";

  const [searchTerms, setSearchTerms] = useState<string>(initialSearch);
  const [placeholderSearch, setPlaceholderSearch] = useState<string>('');

  useEffect(() => {
    setPlaceholderSearch(SAMPLE_SEARCHES[Math.floor(Math.random() * SAMPLE_SEARCHES.length)] ?? '');
  }, [searchTerms]);

  // Focus search input on component mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Update URL when search changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());

    if (searchTerms) {
      params.set('s', searchTerms);
    } else {
      params.delete('s');
    }

    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchTerms, router, searchParams]);

  // Filter function for recipes
  const filteredRecipes = recipes?.filter(recipe => {
    if (!searchTerms.trim()) return true;

    // Split search terms and convert to lowercase
    const terms = searchTerms.toLowerCase().split(/\s+/);

    // Convert recipe details to searchable string
    const searchableString = [
      recipe.recipe.toLowerCase(),
      recipe.profession.toLowerCase(),
      recipe.isCommon ? 'common most crafters' : '',
      recipe.tags?.map((tag) => "#"+tag).join(' ').toLowerCase() ?? '',
      recipe.characters?.map(c => c.name?.toLowerCase()).join(' ') || '',
      (recipe.notes ?? '').toLowerCase()
    ].join(' ');

    // Check if ALL terms are present in the searchable string
    return terms.every(term => searchableString.includes(term));
  }) ?? [];

  // Function to handle tag click and update search
  const handleTagClick = (tag: string) => {
    // Check if the tag is already in the search terms
    const currentTerms = searchTerms.split(/\s+/);
    const tagWithHash = tag;

    // If tag is not already in search terms, add it
    if (!currentTerms.includes(tagWithHash)) {
      setSearchTerms(prev => prev ? `${prev} ${tagWithHash}` : tagWithHash);
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <Input
          ref={searchInputRef}
          type="text"
          placeholder={
            placeholderSearch
              ? `Search recipes, professions, tags, or characters... (e.g. ${placeholderSearch})`
              : "Search recipes, professions, tags, or characters..."
          }
          className="pl-10 w-full"
          value={searchTerms}
          onChange={(e) => setSearchTerms(e.target.value ?? '')}
        />
      </div>

      {isLoading && (
        <div className="text-center py-4 text-gray-500 dark:text-gray-400">Loading recipes...</div>
      )}

      {isSuccess && (
        <div className="overflow-x-auto">
          <WOWHeadTooltips />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recipe</TableHead>
                <TableHead className="hidden md:table-cell">Profession</TableHead>
                <TableHead className="hidden md:table-cell">Crafters</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecipes.map((recipe) => (
                <TableRow key={recipe.recipeSpellId}>
                  <TableCell>
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
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{recipe.profession}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1 my-auto">
                      {recipe.isCommon ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="text-chart-2 text-nowrap italic text-xs">Most crafters</div>
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
                            className="bg-secondary text-secondary-foreground text-xs px-2 py-1 opacity-70 hover:opacity-100 transition-all duration-100"
                            onClick={() => handleTagClick(character.name)}
                          >
                            {character.name}
                          </Button>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {recipe.tags?.map((tag, index) => (
                        <Button
                          key={index}
                          variant="link"
                          size="sm"
                          className="text-xs opacity-70 hover:opacity-100 transition-all font-normal duration-100 p-0 text-muted-foreground h-3"
                          onClick={() => handleTagClick(`#${tag}`)}
                        >
                          #{tag}
                        </Button>
                      ))}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {filteredRecipes.length === 0 && (
            <div className="text-center py-4 text-muted-foreground">
              No recipes found matching your search
            </div>
          )}
        </div>
      )}
    </div>
  )
}