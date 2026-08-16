import { cn } from "~/lib/utils";
import type { SignupVolumeRoleCounts } from "~/components/raid-planner/signup-volume-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

/**
 * Dashboard-only signup bar: raid size is a dotted threshold marker, not the end of
 * the track. Signups routinely run 50-60 on a 40-man, so the track scales to 1.5x
 * capacity (or the count, whichever is larger) and the surplus past capacity keeps
 * drawing instead of clipping. Distinct from raid-planner's SignupVolumeIndicator
 * (which does clip at capacity) since that component also serves the AA-slot editor
 * views, where "signups over capacity" isn't a state worth designing for.
 */
export function SignupSizeBar({
  count,
  target,
  roleCounts,
}: {
  count: number;
  target: number;
  roleCounts?: SignupVolumeRoleCounts;
}) {
  const trackMax = Math.max(target * 1.5, count, 1);
  const fillRatio = target > 0 ? count / target : 0;
  const rosterCount = Math.min(count, target);
  const surplusCount = Math.max(count - target, 0);

  const rosterColorClass =
    fillRatio >= 1 ? "bg-chart-2" : fillRatio >= 0.75 ? "bg-primary" : "bg-muted-foreground/50";

  const bar = (
    <div className="flex items-center gap-2">
      <span className="w-11 shrink-0 text-right text-xs font-bold">
        {count}
        <span className="font-normal text-muted-foreground">/{target}</span>
      </span>
      <div className="relative h-[9px] flex-1 overflow-hidden rounded-sm bg-muted">
        <div
          className={cn("absolute inset-y-0 left-0 transition-all", rosterColorClass)}
          style={{ width: `${(rosterCount / trackMax) * 100}%` }}
        />
        {surplusCount > 0 ? (
          <div
            className="absolute inset-y-0 bg-chart-4/75 transition-all"
            style={{
              left: `${(rosterCount / trackMax) * 100}%`,
              width: `${(surplusCount / trackMax) * 100}%`,
            }}
          />
        ) : null}
        <div
          className="pointer-events-none absolute inset-y-0 border-l border-dotted border-foreground/85"
          style={{ left: `${(target / trackMax) * 100}%` }}
        />
      </div>
    </div>
  );

  if (!roleCounts) return bar;

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{bar}</TooltipTrigger>
      <TooltipContent
        side="right"
        className="border-border/80 bg-card/95 text-secondary-foreground"
      >
        <div className="space-y-0.5 text-xs">
          <div className="font-semibold text-foreground">
            {count} / {target} signups
          </div>
          <div>Tank {roleCounts.Tank}</div>
          <div>Healer {roleCounts.Healer}</div>
          <div>Melee {roleCounts.Melee}</div>
          <div>Ranged {roleCounts.Ranged}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
