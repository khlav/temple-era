import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import {
  getInstanceIdForZoneName,
  ZONE_ACCENT_CLASSES,
  ZONE_BADGE_COMPACT_CLASSES,
  ZONE_BADGE_LABELS,
} from "~/lib/raid-zones";

/** Zone pill badge — the one place in the UI that's still a pill shape (Pattern Spec:
 *  "the pill shape belongs to zones alone"). Renders nothing for an unresolved zone name. */
export function ZoneBadge({
  zoneName,
  className,
}: {
  zoneName: string | null | undefined;
  className?: string;
}) {
  const zoneId = getInstanceIdForZoneName(zoneName);
  if (!zoneId) return null;

  return (
    <Badge
      variant="outline"
      className={cn(ZONE_ACCENT_CLASSES[zoneId], ZONE_BADGE_COMPACT_CLASSES, className)}
    >
      {ZONE_BADGE_LABELS[zoneId] ?? zoneId.toUpperCase()}
    </Badge>
  );
}
