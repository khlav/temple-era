"use client";

import Link from "next/link";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { CUSTOM_ZONE_ID, CUSTOM_ZONE_DISPLAY_NAME } from "~/lib/raid-zones";

interface PublicPlanRowProps {
  plan: {
    id: string;
    name: string;
    zoneId: string;
    createdAt: Date;
    startAt: Date | null;
  };
}

import { formatRaidDate } from "~/utils/date-formatting";

function PublicPlanRow({ plan }: PublicPlanRowProps) {
  const formattedDate = formatRaidDate(plan.startAt);

  // Map zone IDs to display names
  const zoneNames: Record<string, string> = {
    mc: "Molten Core",
    bwl: "Blackwing Lair",
    aq20: "AQ20",
    aq40: "AQ40",
    naxxramas: "Naxxramas",
    onyxia: "Onyxia",
    zg: "Zul'Gurub",
    [CUSTOM_ZONE_ID]: CUSTOM_ZONE_DISPLAY_NAME,
  };

  const zoneName = zoneNames[plan.zoneId.toLowerCase()] ?? plan.zoneId;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        "transition-colors hover:border-primary hover:bg-accent",
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium">{plan.name}</div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{zoneName}</span>
          {formattedDate && <span>{formattedDate}</span>}
        </div>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/raid-plans/${plan.id}`}>View Plan</Link>
      </Button>
    </div>
  );
}

export function PublicRaidPlansList() {
  const { data: plans, isLoading } = api.raidPlan.getPublicPlans.useQuery({
    limit: 20,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        No public raid plans available yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {plans.map((plan) => (
        <PublicPlanRow key={plan.id} plan={plan} />
      ))}
    </div>
  );
}
