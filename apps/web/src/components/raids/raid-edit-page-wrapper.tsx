"use client";

import { EditRaid } from "~/components/raids/edit-raid";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { useEffect } from "react";
import type { Raid } from "~/server/api/interfaces/raid";

interface RaidEditPageWrapperProps {
  raidId: number;
  raidData: Raid;
  initialBreadcrumbData?: { [key: string]: string };
}

export function RaidEditPageWrapper({
  raidId,
  raidData,
  initialBreadcrumbData,
}: RaidEditPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();

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

  return (
    <div>
      <EditRaid raidId={raidId} raidData={raidData} />
    </div>
  );
}
