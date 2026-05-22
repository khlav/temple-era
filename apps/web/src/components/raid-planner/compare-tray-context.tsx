"use client";

import { createContext, useContext, useState } from "react";

export interface PinnedCharacter {
  planCharacterId: string;
  characterId: number;
  primaryCharacterId: number;
  primaryCharacterName: string | null;
  characterName: string;
  characterClass: string | null;
}

interface CompareTrayContextValue {
  pinnedCharacters: PinnedCharacter[];
  pinCharacter: (char: PinnedCharacter) => void;
  unpinCharacter: (planCharacterId: string) => void;
  clearAllPins: () => void;
  isPinned: (planCharacterId: string) => boolean;
}

export const CompareTrayContext = createContext<CompareTrayContextValue | null>(null);

export function CompareTrayProvider({ children }: { children: React.ReactNode }) {
  const [pinnedCharacters, setPinnedCharacters] = useState<PinnedCharacter[]>([]);

  const pinCharacter = (char: PinnedCharacter) => {
    setPinnedCharacters((prev) => {
      if (prev.some((c) => c.planCharacterId === char.planCharacterId)) return prev;
      if (prev.length >= 6) return prev;
      return [...prev, char];
    });
  };

  const unpinCharacter = (planCharacterId: string) => {
    setPinnedCharacters((prev) => prev.filter((c) => c.planCharacterId !== planCharacterId));
  };

  const clearAllPins = () => setPinnedCharacters([]);

  const isPinned = (planCharacterId: string) =>
    pinnedCharacters.some((c) => c.planCharacterId === planCharacterId);

  return (
    <CompareTrayContext.Provider
      value={{ pinnedCharacters, pinCharacter, unpinCharacter, clearAllPins, isPinned }}
    >
      {children}
    </CompareTrayContext.Provider>
  );
}

export function useCompareTray() {
  const ctx = useContext(CompareTrayContext);
  if (!ctx) throw new Error("useCompareTray must be used within CompareTrayProvider");
  return ctx;
}
