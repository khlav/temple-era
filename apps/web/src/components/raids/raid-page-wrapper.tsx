"use client";

import { RaidDetail } from "~/components/raids/raid-detail";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface RaidPageWrapperProps {
  raidId: number;
  showEditButton?: boolean;
  initialBreadcrumbData?: { [key: string]: string };
}

export function RaidPageWrapper({
  raidId,
  showEditButton,
  initialBreadcrumbData,
}: RaidPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: raidData, isSuccess } = api.raid.getRaidById.useQuery(raidId);

  // Set initial breadcrumb data from server
  useEffect(() => {
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    }
  }, [initialBreadcrumbData, updateBreadcrumbSegment]);

  useEffect(() => {
    if (isSuccess && raidData) {
      // Update breadcrumb with raid name (only if not already set by server)
      if (!initialBreadcrumbData?.[raidId.toString()]) {
        updateBreadcrumbSegment(raidId.toString(), raidData.name);
      }
    }
  }, [
    isSuccess,
    raidData,
    raidId,
    updateBreadcrumbSegment,
    initialBreadcrumbData,
  ]);

  return (
    <div>
      <RaidDetail raidId={raidId} showEditButton={showEditButton} />
    </div>
  );
}
