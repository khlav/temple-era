import { cn } from "~/lib/utils";
import { AA_CLASS_COLORS } from "~/lib/aa-formatting";
import { ClassIcon } from "~/components/ui/class-icon";
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
  classCounts,
}: {
  count: number;
  target: number;
  classCounts?: Record<string, number>;
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

  if (!classCounts) return bar;

  // Same shape as the raid detail page's Composition sidebar card: class icon, count,
  // then up to 10 small per-person squares in the class's color (with a +N overflow),
  // sorted by headcount desc.
  const composition = Object.entries(classCounts)
    .map(([characterClass, classCount]) => ({ characterClass, count: classCount }))
    .sort((a, b) => b.count - a.count);

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{bar}</TooltipTrigger>
      <TooltipContent
        side="right"
        className="border-border/80 bg-card/95 text-secondary-foreground"
      >
        <div className="space-y-1.5 text-xs">
          <div className="font-semibold text-foreground">
            {count} / {target} signups
          </div>
          {composition.length === 0 ? (
            <div className="text-muted-foreground">No data yet.</div>
          ) : (
            <div className="flex flex-col gap-1">
              {composition.map((g) => (
                <div key={g.characterClass} className="flex items-center gap-2">
                  <ClassIcon
                    characterClass={g.characterClass.toLowerCase()}
                    px={14}
                    className="shrink-0 rounded-sm"
                  />
                  <span className="font-display w-4 shrink-0 text-right text-xs font-semibold">
                    {g.count}
                  </span>
                  <span className="flex flex-wrap items-center gap-[3px]">
                    {Array.from({ length: Math.min(g.count, 10) }).map((_, i) => (
                      <span
                        key={i}
                        className={cn(
                          "h-[11px] w-[11px] shrink-0 rounded-[2px]",
                          i === 4 && "mr-[3px]",
                        )}
                        style={{
                          backgroundColor:
                            AA_CLASS_COLORS[g.characterClass.toLowerCase()] ?? "#8a8a8a",
                        }}
                      />
                    ))}
                    {g.count > 10 ? (
                      <span
                        className="font-display ml-0.5 shrink-0 text-[10px] font-bold leading-none"
                        style={{
                          color: AA_CLASS_COLORS[g.characterClass.toLowerCase()] ?? "#8a8a8a",
                        }}
                      >
                        +{g.count - 10}
                      </span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
