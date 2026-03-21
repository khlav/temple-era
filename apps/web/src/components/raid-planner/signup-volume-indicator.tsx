import Image from "next/image";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
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

const ROLE_ROWS = [
  {
    role: "Tank",
    key: "Tank",
    color: "bg-amber-400",
    textColor: "text-amber-300",
    icon: "tank",
  },
  {
    role: "Melee",
    key: "Melee",
    color: "bg-rose-500",
    textColor: "text-rose-300",
    icon: "melee",
  },
  {
    role: "Ranged",
    key: "Ranged",
    color: "bg-sky-500",
    textColor: "text-sky-300",
    icon: "ranged",
  },
  {
    role: "Healer",
    key: "Healer",
    color: "bg-emerald-500",
    textColor: "text-emerald-300",
    icon: "healer",
  },
] as const;

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

  if (percentage < 0.67) {
    return { bg: "bg-slate-500", text: "text-slate-300" };
  }
  if (percentage < 1.0) {
    return { bg: "bg-sky-500", text: "text-sky-300" };
  }
  if (percentage > 1.15) {
    return { bg: "bg-primary", text: "text-primary" };
  }

  return { bg: "bg-emerald-500", text: "text-emerald-400" };
}

interface SignupVolumeIndicatorProps {
  count: number;
  title: string;
  channelName: string;
  variant?: IndicatorVariant;
  roleCounts?: SignupVolumeRoleCounts;
}

function RoleSignupTooltip({
  count,
  target,
  roleCounts,
}: {
  count: number;
  target: number;
  roleCounts: SignupVolumeRoleCounts;
}) {
  const PEOPLE_PER_PILL = 5;

  return (
    <TooltipContent
      side="right"
      className="border-border/80 bg-card/95 text-secondary-foreground"
    >
      <div className="space-y-1 text-xs">
        <div className="font-semibold text-foreground">
          {count} / {target} signups
        </div>
        <div className="h-px bg-border" />
        <div className="space-y-1">
          {ROLE_ROWS.map((row) => {
            const rowCount = roleCounts[row.key];
            const pillsNeeded = Math.max(
              1,
              Math.ceil(rowCount / PEOPLE_PER_PILL),
            );

            return (
              <div key={row.role} className="flex items-center gap-1">
                <span
                  className={cn(
                    "w-5 shrink-0 text-right font-mono font-semibold",
                    row.textColor,
                  )}
                >
                  {rowCount}
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
                      Math.min(1, (rowCount - segmentStart) / PEOPLE_PER_PILL),
                    );

                    return (
                      <div
                        key={i}
                        className="h-2 w-6 overflow-hidden rounded bg-muted/35"
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
  );
}

export function SignupVolumeIndicator({
  count,
  title,
  channelName,
  variant = "total",
  roleCounts,
}: SignupVolumeIndicatorProps) {
  const target = getRaidTarget(title, channelName);

  if (variant === "role" && roleCounts) {
    const PEOPLE_PER_PILL = 5;

    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <div className="flex flex-col gap-px">
              {ROLE_ROWS.map((row) => {
                const rowCount = roleCounts[row.key];
                const pillsNeeded = Math.max(
                  1,
                  Math.ceil(rowCount / PEOPLE_PER_PILL),
                );

                return (
                  <div key={row.role} className="flex h-1.5 gap-px">
                    {Array.from({ length: pillsNeeded }).map((_, i) => {
                      const segmentStart = i * PEOPLE_PER_PILL;
                      const fillAmount = Math.max(
                        0,
                        Math.min(
                          1,
                          (rowCount - segmentStart) / PEOPLE_PER_PILL,
                        ),
                      );

                      return (
                        <div
                          key={i}
                          className="relative h-full w-5 overflow-hidden rounded bg-muted/35"
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
          <RoleSignupTooltip
            count={count}
            target={target}
            roleCounts={roleCounts}
          />
        </Tooltip>
      </TooltipProvider>
    );
  }

  const colors = getSignupStatusColor(count, target);
  const isTwentyMan = target === RAID_TARGETS.TWENTY_MAN;
  const containerWidth = isTwentyMan ? 50 : 100;
  const barWidth = Math.min(count * 2, containerWidth);
  const targetMarkerPos = target * 2;
  const hasOverflow = count * 2 > containerWidth;

  const indicator = (
    <div className="flex items-center gap-1">
      <div
        className="relative mt-0.5 h-2 rounded-sm bg-muted/35"
        style={{ width: `${containerWidth}px` }}
      >
        <div
          className={cn(
            "h-full rounded-sm transition-all duration-300",
            colors.bg,
          )}
          style={{ width: `${barWidth}px` }}
        />
        <div
          className="absolute -bottom-1 -top-1 z-10 w-[2px] bg-foreground/30"
          style={{ left: `${targetMarkerPos}px` }}
        />
      </div>

      {hasOverflow && (
        <span className="text-base font-bold leading-none text-primary">+</span>
      )}
    </div>
  );

  if (roleCounts) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{indicator}</TooltipTrigger>
          <RoleSignupTooltip
            count={count}
            target={target}
            roleCounts={roleCounts}
          />
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent
          side="right"
          className="border-border/80 bg-card/95 text-secondary-foreground"
        >
          <div className="text-xs font-semibold">
            <span className={colors.text}>
              {count} / {target} signups
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
