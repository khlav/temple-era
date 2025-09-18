"use client";

import { RaidDetail } from "~/components/raids/raid-detail";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface RaidPageWrapperProps {
  raidId: number;
  showEditButton?: boolean;
}

export function RaidPageWrapper({
  raidId,
  showEditButton,
}: RaidPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: raidData, isSuccess } = api.raid.getRaidById.useQuery(raidId);

  useEffect(() => {
    if (isSuccess && raidData) {
      // Update breadcrumb with raid name
      updateBreadcrumbSegment(raidId.toString(), raidData.name);
    }
  }, [isSuccess, raidData, raidId, updateBreadcrumbSegment]);

  return (
    <div>
      <RaidDetail raidId={raidId} showEditButton={showEditButton} />
    </div>
  );
}
