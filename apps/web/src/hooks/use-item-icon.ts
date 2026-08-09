/**
 * Hook to fetch item icon data from Wowhead's API.
 * Caches results in memory to avoid repeated requests. Mirrors use-spell-icon.ts.
 */

import { useState, useEffect } from "react";

interface ItemIconData {
  icon: string | null;
  loading: boolean;
  error: string | null;
}

// In-memory cache for item icons (persists across component instances)
const itemIconCache = new Map<number, string>();
const pendingRequests = new Map<number, Promise<string | null>>();

/**
 * Fetch item icon from Wowhead's tooltip API.
 * Uses Classic endpoint for better Classic item coverage.
 */
async function fetchItemIcon(itemId: number): Promise<string | null> {
  // Check cache first
  if (itemIconCache.has(itemId)) {
    return itemIconCache.get(itemId)!;
  }

  // Check if there's already a pending request for this item
  if (pendingRequests.has(itemId)) {
    return pendingRequests.get(itemId)!;
  }

  // Create the fetch promise
  const fetchPromise = (async () => {
    try {
      // Try Classic endpoint first (better for Classic Era items)
      const response = await fetch(
        `https://nether.wowhead.com/classic/tooltip/item/${itemId}?dataEnv=4&locale=0`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        // Fallback to retail endpoint
        const retailResponse = await fetch(
          `https://nether.wowhead.com/tooltip/item/${itemId}?dataEnv=1&locale=0`,
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
          itemIconCache.set(itemId, retailData.icon);
          return retailData.icon;
        }
        return null;
      }

      const data = (await response.json()) as { icon?: string };
      if (data.icon) {
        itemIconCache.set(itemId, data.icon);
        return data.icon;
      }

      return null;
    } catch {
      return null;
    } finally {
      // Clean up pending request
      pendingRequests.delete(itemId);
    }
  })();

  pendingRequests.set(itemId, fetchPromise);
  return fetchPromise;
}

/**
 * Hook to get item icon for a given item ID.
 * Returns the icon texture name and loading/error states.
 */
export function useItemIcon(itemId: number): ItemIconData {
  const [icon, setIcon] = useState<string | null>(() => itemIconCache.get(itemId) ?? null);
  const [loading, setLoading] = useState(!itemIconCache.has(itemId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already cached, no need to fetch
    if (itemIconCache.has(itemId)) {
      setIcon(itemIconCache.get(itemId)!);
      setLoading(false);
      return;
    }

    let cancelled = false;

    setLoading(true);
    setError(null);

    fetchItemIcon(itemId)
      .then((result) => {
        if (cancelled) return;
        setIcon(result);
        setLoading(false);
        if (!result) {
          setError(`Item ${itemId} not found`);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
        setError(`Failed to fetch item ${itemId}`);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return { icon, loading, error };
}

/**
 * Get the Wowhead CDN URL for an item icon texture.
 */
export function getItemIconUrl(
  iconName: string,
  size: "small" | "medium" | "large" = "medium",
): string {
  return `https://wow.zamimg.com/images/wow/icons/${size}/${iconName.toLowerCase()}.jpg`;
}
