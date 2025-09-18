"use client";

import { EditRaid } from "~/components/raids/edit-raid";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface RaidEditPageWrapperProps {
  raidId: number;
  initialBreadcrumbData?: { [key: string]: string };
}

export function RaidEditPageWrapper({
  raidId,
  initialBreadcrumbData,
}: RaidEditPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: raidData, isSuccess } = api.raid.getRaidById.useQuery(raidId);

  // Set initial breadcrumb data from server
  useEffect(() => {
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    }
    // Always set "edit" segment
    updateBreadcrumbSegment("edit", "Edit");
  }, [initialBreadcrumbData, updateBreadcrumbSegment]);

  useEffect(() => {
    if (isSuccess && raidData) {
      // Update breadcrumb with raid name for both the raid and edit segments
      // Only update raid name if not already set by server
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
      <EditRaid raidId={raidId} />
    </div>
  );
}
