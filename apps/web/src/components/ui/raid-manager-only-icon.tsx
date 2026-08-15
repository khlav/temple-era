"use client";

import { Shield } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

/**
 * Prefix icon for flagging manager-gated UI (tab labels, section headers, etc.) as
 * "Raid Manager Only" — start using this wherever raidplan:manage-gated content needs a
 * visible marker instead of just being conditionally rendered.
 */
export function RaidManagerOnlyIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Shield
          size={size}
          className={cn("text-muted-foreground", className)}
          aria-label="Raid Manager only"
        />
      </TooltipTrigger>
      <TooltipContent className="bg-secondary text-muted-foreground">
        Raid Manager only
      </TooltipContent>
    </Tooltip>
  );
}
