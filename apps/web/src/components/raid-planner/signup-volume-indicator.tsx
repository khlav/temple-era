import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type IndicatorVariant = "total" | "role";

export interface SignupVolumeRoleCounts {
  Tank: number;
  Melee: number;
  Ranged: number;
  Healer: number;
}

export const RAID_TARGETS = {
  DEFAULT: 40,
  TWENTY_MAN: 20,
};

export function getRaidTarget(title: string, channelName: string): number {
  const text = (title + " " + channelName).toLowerCase();
  if (text.includes("aq20") || text.includes("zg") || text.includes("20")) {
    return RAID_TARGETS.TWENTY_MAN;
  }
  return RAID_TARGETS.DEFAULT;
}

export function getSignupStatusColor(count: number, target: number) {
  const percentage = count / target;
  if (percentage < 0.67) return { bg: "bg-red-500", text: "text-red-500" };
  if (percentage < 1.0) return { bg: "bg-amber-500", text: "text-amber-500" };
  if (percentage > 1.15) return { bg: "bg-blue-600", text: "text-blue-600" };
  return { bg: "bg-emerald-500", text: "text-emerald-500" };
}

interface SignupVolumeIndicatorProps {
  count: number;
  title: string;
  channelName: string;
  variant?: IndicatorVariant;
  roleCounts?: SignupVolumeRoleCounts;
}

export function SignupVolumeIndicator({
  count,
  title,
  channelName,
  variant = "total",
  roleCounts,
}: SignupVolumeIndicatorProps) {
  if (variant === "role" && roleCounts) {
    // Role Variant: 4 Rows (Tank, Melee, Ranged, Healer)
    const ROWS = [
      { role: "Tank", count: roleCounts.Tank, color: "bg-amber-500" },
      { role: "Melee", count: roleCounts.Melee, color: "bg-red-500" },
      { role: "Ranged", count: roleCounts.Ranged, color: "bg-blue-500" },
      { role: "Healer", count: roleCounts.Healer, color: "bg-emerald-500" },
    ] as const;

    const PEOPLE_PER_PILL = 5;
    const target = getRaidTarget(title, channelName);

    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-px">
              {ROWS.map((row) => {
                // Calculate dynamic number of pills needed for this row
                const pillsNeeded = Math.max(
                  1,
                  Math.ceil(row.count / PEOPLE_PER_PILL),
                );

                return (
                  <div key={row.role} className="flex h-1.5 gap-px">
                    {Array.from({ length: pillsNeeded }).map((_, i) => {
                      const segmentStart = i * PEOPLE_PER_PILL;
                      const fillAmount = Math.max(
                        0,
                        Math.min(
                          1,
                          (row.count - segmentStart) / PEOPLE_PER_PILL,
                        ),
                      );

                      return (
                        <div
                          key={i}
                          className="relative h-full w-5 overflow-hidden rounded bg-muted/20"
                        >
                          {fillAmount > 0 && (
                            <div
                              className={cn(
                                "h-full transition-all duration-300",
                                row.color,
                              )}
                              style={{ width: `${fillAmount * 100}%` }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </TooltipTrigger>
          <TooltipContent
            side="right"
            className="bg-secondary text-secondary-foreground"
          >
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-foreground">
                {count} / {target} signups
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-1">
                {[
                  {
                    role: "Tank",
                    count: roleCounts.Tank,
                    color: "bg-amber-500",
                    textColor: "text-amber-500",
                    icon: "tank",
                  },
                  {
                    role: "Melee",
                    count: roleCounts.Melee,
                    color: "bg-red-500",
                    textColor: "text-red-500",
                    icon: "melee",
                  },
                  {
                    role: "Ranged",
                    count: roleCounts.Ranged,
                    color: "bg-blue-500",
                    textColor: "text-blue-500",
                    icon: "ranged",
                  },
                  {
                    role: "Healer",
                    count: roleCounts.Healer,
                    color: "bg-emerald-500",
                    textColor: "text-emerald-500",
                    icon: "healer",
                  },
                ].map((row) => {
                  const PEOPLE_PER_PILL = 5;
                  const pillsNeeded = Math.max(
                    1,
                    Math.ceil(row.count / PEOPLE_PER_PILL),
                  );

                  return (
                    <div key={row.role} className="flex items-center gap-1">
                      <span
                        className={cn(
                          "w-5 shrink-0 text-right font-mono font-semibold",
                          row.textColor,
                        )}
                      >
                        {row.count}
                      </span>
                      <Image
                        src={`/img/aa/role_${row.icon}.svg`}
                        alt={row.role}
                        width={14}
                        height={14}
                        className="shrink-0"
                      />
                      <div className="flex gap-px">
                        {Array.from({ length: pillsNeeded }).map((_, i) => {
                          const segmentStart = i * PEOPLE_PER_PILL;
                          const fillAmount = Math.max(
                            0,
                            Math.min(
                              1,
                              (row.count - segmentStart) / PEOPLE_PER_PILL,
                            ),
                          );

                          return (
                            <div
                              key={i}
                              className="h-2 w-6 overflow-hidden rounded bg-muted/30"
                            >
                              {fillAmount > 0 && (
                                <div
                                  className={cn(
                                    "h-full transition-all duration-300",
                                    row.color,
                                  )}
                                  style={{ width: `${fillAmount * 100}%` }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Total Variant
  const target = getRaidTarget(title, channelName);
  const colors = getSignupStatusColor(count, target);

  const isTwentyMan = target === RAID_TARGETS.TWENTY_MAN;
  const containerWidth = isTwentyMan ? 50 : 100;

  // Width logic: 2px per signup, capped at container width
  const barWidth = Math.min(count * 2, containerWidth);
  const targetMarkerPos = target * 2; // Position of the vertical line
  const hasOverflow = count * 2 > containerWidth; // Check if signups exceed what the bar can display

  const indicator = (
    <div className="flex items-center gap-1">
      <div
        className="relative mt-0.5 h-2 rounded-sm bg-muted/30"
        style={{ width: `${containerWidth}px` }}
      >
        {/* The progress bar */}
        <div
          className={`h-full rounded-sm ${colors.bg} transition-all duration-300`}
          style={{ width: `${barWidth}px` }}
        />

        {/* Target marker (vertical line) */}
        <div
          className="absolute -bottom-1 -top-1 z-10 w-[2px] bg-foreground/30"
          style={{ left: `${targetMarkerPos}px` }}
        />
      </div>

      {/* Overflow indicator - show blue + if signups exceed bar capacity */}
      {hasOverflow && (
        <span className="text-base font-bold leading-none text-blue-600">
          +
        </span>
      )}
    </div>
  );

  // Wrap in tooltip if roleCounts are available
  if (roleCounts) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{indicator}</TooltipTrigger>
          <TooltipContent
            side="right"
            className="bg-secondary text-secondary-foreground"
          >
            <div className="space-y-1 text-xs">
              <div className="font-semibold text-foreground">
                {count} / {target} signups
              </div>
              <div className="h-px bg-border" />
              <div className="space-y-1">
                {[
                  {
                    role: "Tank",
                    count: roleCounts.Tank,
                    color: "bg-amber-500",
                    textColor: "text-amber-500",
                    icon: "tank",
                  },
                  {
                    role: "Melee",
                    count: roleCounts.Melee,
                    color: "bg-red-500",
                    textColor: "text-red-500",
                    icon: "melee",
                  },
                  {
                    role: "Ranged",
                    count: roleCounts.Ranged,
                    color: "bg-blue-500",
                    textColor: "text-blue-500",
                    icon: "ranged",
                  },
                  {
                    role: "Healer",
                    count: roleCounts.Healer,
                    color: "bg-emerald-500",
                    textColor: "text-emerald-500",
                    icon: "healer",
                  },
                ].map((row) => {
                  const PEOPLE_PER_PILL = 5;
                  const pillsNeeded = Math.max(
                    1,
                    Math.ceil(row.count / PEOPLE_PER_PILL),
                  );

                  return (
                    <div key={row.role} className="flex items-center gap-1">
                      <span
                        className={cn(
                          "w-5 shrink-0 text-right font-mono font-semibold",
                          row.textColor,
                        )}
                      >
                        {row.count}
                      </span>
                      <Image
                        src={`/img/aa/role_${row.icon}.svg`}
                        alt={row.role}
                        width={14}
                        height={14}
                        className="shrink-0"
                      />
                      <div className="flex gap-px">
                        {Array.from({ length: pillsNeeded }).map((_, i) => {
                          const segmentStart = i * PEOPLE_PER_PILL;
                          const fillAmount = Math.max(
                            0,
                            Math.min(
                              1,
                              (row.count - segmentStart) / PEOPLE_PER_PILL,
                            ),
                          );

                          return (
                            <div
                              key={i}
                              className="h-2 w-6 overflow-hidden rounded bg-muted/30"
                            >
                              {fillAmount > 0 && (
                                <div
                                  className={cn(
                                    "h-full transition-all duration-300",
                                    row.color,
                                  )}
                                  style={{ width: `${fillAmount * 100}%` }}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return indicator;
}
