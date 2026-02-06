/**
 * Hook to fetch spell icon data from Wowhead's API.
 * Caches results in memory to avoid repeated requests.
 */

import { useState, useEffect } from "react";

interface SpellIconData {
  icon: string | null;
  loading: boolean;
  error: string | null;
}

// In-memory cache for spell icons (persists across component instances)
const spellIconCache = new Map<number, string>();
const pendingRequests = new Map<number, Promise<string | null>>();

/**
 * Fetch spell icon from Wowhead's tooltip API.
 * Uses Classic endpoint for better Classic spell coverage.
 */
async function fetchSpellIcon(spellId: number): Promise<string | null> {
  // Check cache first
  if (spellIconCache.has(spellId)) {
    return spellIconCache.get(spellId)!;
  }

  // Check if there's already a pending request for this spell
  if (pendingRequests.has(spellId)) {
    return pendingRequests.get(spellId)!;
  }

  // Create the fetch promise
  const fetchPromise = (async () => {
    try {
      // Try Classic endpoint first (better for Classic Era spells)
      const response = await fetch(
        `https://nether.wowhead.com/classic/tooltip/spell/${spellId}?dataEnv=4&locale=0`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        // Fallback to retail endpoint
        const retailResponse = await fetch(
          `https://nether.wowhead.com/tooltip/spell/${spellId}?dataEnv=1&locale=0`,
          {
            headers: {
              Accept: "application/json",
            },
          },
        );

        if (!retailResponse.ok) {
          return null;
        }

        const retailData = (await retailResponse.json()) as { icon?: string };
        if (retailData.icon) {
          spellIconCache.set(spellId, retailData.icon);
          return retailData.icon;
        }
        return null;
      }

      const data = (await response.json()) as { icon?: string };
      if (data.icon) {
        spellIconCache.set(spellId, data.icon);
        return data.icon;
      }

      return null;
    } catch {
      return null;
    } finally {
      // Clean up pending request
      pendingRequests.delete(spellId);
    }
  })();

  pendingRequests.set(spellId, fetchPromise);
  return fetchPromise;
}

/**
 * Hook to get spell icon for a given spell ID.
 * Returns the icon texture name and loading/error states.
 */
export function useSpellIcon(spellId: number): SpellIconData {
  const [icon, setIcon] = useState<string | null>(
    () => spellIconCache.get(spellId) ?? null,
  );
  const [loading, setLoading] = useState(!spellIconCache.has(spellId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already cached, no need to fetch
    if (spellIconCache.has(spellId)) {
      setIcon(spellIconCache.get(spellId)!);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchSpellIcon(spellId)
      .then((result) => {
        if (cancelled) return;
        setIcon(result);
        setLoading(false);
        if (!result) {
          setError(`Spell ${spellId} not found`);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(`Failed to fetch spell ${spellId}`);
      });

    return () => {
      cancelled = true;
    };
  }, [spellId]);

  return { icon, loading, error };
}

/**
 * Get the Wowhead CDN URL for a spell icon texture.
 */
export function getSpellIconUrl(
  iconName: string,
  size: "small" | "medium" | "large" = "medium",
): string {
  return `https://wow.zamimg.com/images/wow/icons/${size}/${iconName.toLowerCase()}.jpg`;
}

/**
 * Prefetch spell icons for a list of spell IDs.
 * Useful for preloading icons when you know which spells will be displayed.
 */
export function prefetchSpellIcons(spellIds: number[]): void {
  for (const spellId of spellIds) {
    if (!spellIconCache.has(spellId) && !pendingRequests.has(spellId)) {
      void fetchSpellIcon(spellId);
    }
  }
}
