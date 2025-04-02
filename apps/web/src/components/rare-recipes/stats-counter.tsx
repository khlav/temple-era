// StatsCounter.tsx
"use client"

import { useState, useEffect } from "react";
import { useSpring, animated } from "@react-spring/web";
import type { RecipeWithCharacters } from "~/server/api/interfaces/recipe";

// Type for our stats
type StatProps = {
  label: string;
  value: number;
}

// Individual stat display component with rolling number animation
const StatDisplay = ({ label, value }: StatProps) => {
  // Track when component is mounted to prevent animation from 0 on initial load
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Set mounted after a small delay to ensure we get the real initial value
    const timer = setTimeout(() => setIsMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // Fix for useSpring TypeScript error
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-assignment
  const { number } = useSpring({
    from: { number: isMounted ? 0 : value },
    to: { number: value },
    delay: 20,
    config: { mass: 1, tension: 70, friction: 20 },
  });

  return (
    <div className="flex flex-col items-center justify-center px-4">
      <div className="text-3xl font-bold text-primary leading-none">
        <animated.span>
          {/* eslint-disable-next-line @typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-argument */}
          {number.to((n) => Math.floor(n).toLocaleString())}
        </animated.span>
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
};

// Main stats counter component with proper typing
export const StatsCounter = ({
                               recipes,
                               filteredRecipes
                             }: {
  recipes: RecipeWithCharacters[] | undefined,
  filteredRecipes: RecipeWithCharacters[]
}) => {
  // Add key to force component re-render when data is loaded
  const [key, setKey] = useState(0);

  // Reset the key when data is loaded to force proper rendering
  useEffect(() => {
    if (filteredRecipes.length > 0 && key === 0) {
      setKey(1);
    }
  }, [filteredRecipes, key]);

  // Calculate stats
  const recipesCount = filteredRecipes.length;

  // Count unique crafters (exclude common recipes)
  const craftersCount = new Set(
    filteredRecipes
      .flatMap(r => r.characters?.map(c => c.characterId) || [])
  ).size;

  // Count total entries (character-recipe pairs)
  const entriesCount = filteredRecipes
      .reduce((acc, r) => acc + (r.characters?.length || 0), 0)
    + filteredRecipes.filter(r => r.isCommon).length; // Count common recipes as 1 entry each

  return (
    <div className="hidden md:flex justify-around py-3 border-b">
      <StatDisplay key={`recipes-${key}`} label="Recipes" value={recipesCount} />
      <StatDisplay key={`crafters-${key}`} label="Crafters" value={craftersCount} />
      <StatDisplay key={`entries-${key}`} label="Entries" value={entriesCount} />
    </div>
  );
};