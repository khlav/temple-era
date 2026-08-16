"use client";

import { api } from "~/trpc/react";
import { RaidsListCard } from "~/components/dashboard/raids-list-card";

export function RecentTrackedRaids() {
  const { data: trackedRaidData, isLoading } = api.dashboard.getTrackedRaidsL6LockoutWk.useQuery();

  return (
    <RaidsListCard
      title="Raids from last 6 complete lockouts"
      viewAllHref="/raids"
      raids={trackedRaidData}
      isLoading={isLoading}
    />
  );
}
