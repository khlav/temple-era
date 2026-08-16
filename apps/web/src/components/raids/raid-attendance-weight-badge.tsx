"use client";

import { Tooltip, TooltipTrigger } from "~/components/ui/tooltip";
import { TooltipContent } from "@radix-ui/react-tooltip";
import { cn } from "~/lib/utils";
import {
  TRACKED_RAID_LABEL__FULL_CREDIT,
  TRACKED_RAID_LABEL__HALF_CREDIT,
  TRACKED_RAID_LABEL__NO_CREDIT,
  TRACKED_RAID_LABEL__FULL_CREDIT_PROSE,
  TRACKED_RAID_LABEL__HALF_CREDIT_PROSE,
  TRACKED_RAID_LABEL__NO_CREDIT_PROSE,
} from "~/constants";

const trackedRaidTooltipContent = (
  <span>50%+ raid attendance credit is needed to SR certain Naxxramas items.</span>
);
const optionalRaidTooltipContent = "Fun with friends.  Come get some.";

/** Credit is a quantity on one scale, so it's one accent hue at three intensities —
 *  never three colors, never a pill (that shape is reserved for zone badges). */
function creditColorClass(attendanceWeight: number) {
  if (attendanceWeight === 0.5) return "text-primary/60";
  if (attendanceWeight > 0) return "text-primary";
  return "text-muted-foreground/55";
}

function creditGlyph(attendanceWeight: number) {
  if (attendanceWeight === 0.5) return TRACKED_RAID_LABEL__HALF_CREDIT;
  if (attendanceWeight > 0) return TRACKED_RAID_LABEL__FULL_CREDIT;
  return TRACKED_RAID_LABEL__NO_CREDIT;
}

function creditProse(attendanceWeight: number) {
  if (attendanceWeight === 0.5) return TRACKED_RAID_LABEL__HALF_CREDIT_PROSE;
  if (attendanceWeight > 0) return TRACKED_RAID_LABEL__FULL_CREDIT_PROSE;
  return TRACKED_RAID_LABEL__NO_CREDIT_PROSE;
}

export const RaidAttendenceWeightBadge = ({
  attendanceWeight,
  variant = "glyph",
  className,
}: {
  attendanceWeight: number;
  /** "glyph" (×1 / ×½ / —) for table/numeric columns, "prose" (full credit / half
   *  credit / not tracked) for sentence context like the raid detail header. Never
   *  mix the two in one place. */
  variant?: "glyph" | "prose";
  className?: string;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span
        className={cn(
          creditColorClass(attendanceWeight),
          variant === "glyph" ? "font-display text-[15px] font-bold" : "text-sm",
          className,
        )}
      >
        {variant === "glyph" ? creditGlyph(attendanceWeight) : creditProse(attendanceWeight)}
      </span>
    </TooltipTrigger>
    <TooltipContent>
      <div className="mb-0.5 rounded-lg bg-muted px-3 py-1 text-center text-xs text-muted-foreground shadow-sm transition-all">
        {attendanceWeight > 0 ? trackedRaidTooltipContent : optionalRaidTooltipContent}
      </div>
    </TooltipContent>
  </Tooltip>
);
