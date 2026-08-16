"use client";

import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Skeleton } from "~/components/ui/skeleton";
import { ExternalLink, Edit } from "lucide-react";
import { useSession } from "next-auth/react";
import { formatRaidDay, formatRaidTime } from "~/utils/date-formatting";
import { api, type RouterOutputs } from "~/trpc/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import {
  ZONE_ACCENT_CLASSES,
  ZONE_BADGE_COMPACT_CLASSES,
  ZONE_BADGE_LABELS,
} from "~/lib/raid-zones";
import { getEasternNow } from "~/lib/raid-formatting";
import { getTuesdayAnchoredWeekStart } from "~/server/api/v2/helpers/lockout-weeks";

type PublicPlan = RouterOutputs["raidPlan"]["getPublicPlans"][number];

function weekGroupLabel(plan: PublicPlan, currentWeekStart: Date): string {
  if (!plan.startAt) return "Previous weeks";
  const week = getTuesdayAnchoredWeekStart(new Date(plan.startAt));
  if (week.getTime() === currentWeekStart.getTime()) return "This week";
  const lastWeekStart = new Date(currentWeekStart);
  lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);
  if (week.getTime() === lastWeekStart.getTime()) return "Last week";
  return "Previous weeks";
}

export function PublicPlansTable() {
  const { data: session } = useSession();
  const isRaidManager = !!session?.user?.isRaidManager;

  const { data: plans, isLoading } = api.raidPlan.getPublicPlans.useQuery({
    limit: 20,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="panel-subtle rounded-2xl border border-border/70 py-8 text-center text-sm text-muted-foreground">
        No public raid plans available yet.
      </div>
    );
  }

  const currentWeekStart = getTuesdayAnchoredWeekStart(getEasternNow());

  let lastGroupLabel: string | null = null;

  return (
    <div className="panel-subtle overflow-hidden rounded-2xl border border-border/70">
      <div className="flex items-center justify-between border-b border-border/70 bg-card/80 px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        <span>Plans ({plans.length})</span>
      </div>
      {plans.map((plan) => {
        let dateStr = "";
        let timeStr = "";
        if (plan.startAt) {
          dateStr = formatRaidDay(plan.startAt);
          timeStr = formatRaidTime(plan.startAt);
        }

        const groupLabel = weekGroupLabel(plan, currentWeekStart);
        const showGroupLabel = groupLabel !== lastGroupLabel;
        lastGroupLabel = groupLabel;

        const zoneClass = ZONE_ACCENT_CLASSES[plan.zoneId] ?? ZONE_ACCENT_CLASSES.custom;
        const zoneLabel = ZONE_BADGE_LABELS[plan.zoneId] ?? plan.zoneId.toUpperCase();

        return (
          <div key={plan.id}>
            {showGroupLabel ? (
              <div className="font-display border-b border-border/70 bg-background/80 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/85">
                {groupLabel}
              </div>
            ) : null}
            <div className="group relative flex items-center gap-3 border-b border-border/45 px-4 py-2.5 text-sm transition-colors last:border-b-0 hover:bg-accent/35">
              <Link
                href={`/raid-plans/${plan.id}`}
                className="absolute inset-0"
                aria-label={plan.name}
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-secondary-foreground transition-colors group-hover:text-primary">
                    {plan.name}
                  </span>
                  <Badge variant="outline" className={cn(ZONE_BADGE_COMPACT_CLASSES, zoneClass)}>
                    {zoneLabel}
                  </Badge>
                </div>
                <div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  {dateStr}
                  {timeStr ? ` · ${timeStr}` : ""}
                </div>
              </div>
              <div className="relative z-10 flex shrink-0 items-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={`https://raid-helper.dev/event/${plan.raidHelperEventId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span className="sr-only">View on Raid-Helper</span>
                    </a>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="rounded bg-secondary px-3 py-1 text-xs text-muted-foreground shadow-sm transition-all"
                  >
                    Raid Helper
                  </TooltipContent>
                </Tooltip>
                {isRaidManager ? (
                  <Link
                    href={`/raid-manager/raid-planner/${plan.id}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
                    aria-label={`Edit ${plan.name}`}
                  >
                    <Edit className="h-4 w-4" />
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
