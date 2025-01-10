"use client";

import { EmptyRaid, Raid } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";
import { RaidDetailBase } from "~/components/raids/raid-detail-base";

export function RaidDetail({
  raidId,
  showEditButton,
}: {
  raidId: number;
  showEditButton?: boolean;
}) {
  const {
    data: raidData,
    isSuccess,
    isLoading,
    isError,
  } = api.raid.getRaidById.useQuery(raidId ?? "");

  return (
    <div>
      {isSuccess && <RaidDetailBase raidData={raidData ?? EmptyRaid()} showEditButton={showEditButton} />}
    </div>
  );
}
