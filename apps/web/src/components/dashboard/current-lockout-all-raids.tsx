"use client";

import { api } from "~/trpc/react";
import { RaidsListCard } from "~/components/dashboard/raids-list-card";

export function CurrentLockoutAllRaids() {
  const { data: trackedRaidData, isLoading } = api.dashboard.getAllRaidsCurrentLockout.useQuery();

  return (
    <RaidsListCard
      title="Completed raids this lockout"
      viewAllHref="/raids"
      raids={trackedRaidData}
      isLoading={isLoading}
    />
  );
}
