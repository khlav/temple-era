// StatsCounter.tsx
"use client";

import { useState, useEffect } from "react";
import { useSpring, animated } from "@react-spring/web";
import type { RecipeWithCharacters } from "~/server/api/interfaces/recipe";

// Type for our stats
type StatProps = {
  label: string;
  value: number;
};

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

  const { number } = useSpring({
    from: { number: isMounted ? 0 : value },
    to: { number: value },
    delay: 20,
    config: { mass: 1, tension: 70, friction: 20 },
  });

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="font-display text-xl font-bold leading-none text-primary">
        <animated.span>{number.to((n) => Math.floor(n).toLocaleString())}</animated.span>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
};

// Main stats counter component with proper typing — lives in the profession rail, so it's
// deliberately just Crafters/Entries (the recipe count is already on the rail's "All
// professions" row).
export const StatsCounter = ({ filteredRecipes }: { filteredRecipes: RecipeWithCharacters[] }) => {
  // Add key to force component re-render when data is loaded
  const [key, setKey] = useState(0);

  // Reset the key when data is loaded to force proper rendering
  useEffect(() => {
    if (filteredRecipes.length > 0 && key === 0) {
      setKey(1);
    }
  }, [filteredRecipes, key]);

  // Count unique crafters (exclude common recipes)
  const craftersCount = new Set(
    filteredRecipes.flatMap((r) => r.characters?.map((c) => c.characterId) || []),
  ).size;

  // Count total entries (character-recipe pairs)
  const entriesCount = filteredRecipes.reduce((acc, r) => acc + (r.characters?.length || 0), 0);

  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/70 bg-card/60 px-2 py-3">
      <StatDisplay key={`crafters-${key}`} label="Crafters" value={craftersCount} />
      <StatDisplay key={`entries-${key}`} label="Entries" value={entriesCount} />
    </div>
  );
};
