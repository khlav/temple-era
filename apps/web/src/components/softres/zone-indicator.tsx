/**
 * Zone color indicator - shows a small colored square for raid zones
 * Uses the same colors as attendance heatmap
 */

const ZONE_COLORS = {
  naxxramas: "bg-chart-2", // Teal/cyan
  aq40: "bg-chart-4", // Purple
  bwl: "bg-chart-5", // Pink/red
  mc: "bg-chart-3", // Orange/yellow
} as const;

interface ZoneIndicatorProps {
  raidTitle: string | null | undefined;
  instance: string | null | undefined;
}

/**
 * Detect zone from raid title by searching for keywords
 * Searches for: naxx, aq40, bwl, mc (case insensitive)
 */
function detectZoneFromTitle(title: string): keyof typeof ZONE_COLORS | null {
  const normalizedTitle = title.toLowerCase();

  // Check for zone keywords in priority order (more specific first)
  if (normalizedTitle.includes("naxx")) return "naxxramas";
  if (normalizedTitle.includes("aq40")) return "aq40";
  if (normalizedTitle.includes("bwl")) return "bwl";
  if (normalizedTitle.includes("mc")) return "mc";

  return null;
}

export function ZoneIndicator({ raidTitle, instance }: ZoneIndicatorProps) {
  // Try to detect zone from title first, then fall back to instance
  let detectedZone: keyof typeof ZONE_COLORS | null = null;

  if (raidTitle) {
    detectedZone = detectZoneFromTitle(raidTitle);
  }

  // Fall back to instance if title detection failed
  if (!detectedZone && instance) {
    const normalizedInstance = instance.toLowerCase();
    if (normalizedInstance in ZONE_COLORS) {
      detectedZone = normalizedInstance as keyof typeof ZONE_COLORS;
    }
  }

  // Get color class, default to gray
  const colorClass = detectedZone ? ZONE_COLORS[detectedZone] : "bg-gray-500";

  return <div className={`h-3 w-3 rounded ${colorClass}`} />;
}
