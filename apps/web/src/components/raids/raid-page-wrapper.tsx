"use client";

import { RaidDetail } from "~/components/raids/raid-detail";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { useEffect } from "react";
import type { Raid } from "~/server/api/interfaces/raid";

interface RaidPageWrapperProps {
  raidId: number;
  raidData: Raid;
  showEditButton?: boolean;
  initialBreadcrumbData?: { [key: string]: string };
}

export function RaidPageWrapper({
  raidId,
  raidData,
  showEditButton,
  initialBreadcrumbData,
}: RaidPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();

  // Set initial breadcrumb data from server
  useEffect(() => {
    if (initialBreadcrumbData) {
      Object.entries(initialBreadcrumbData).forEach(([key, value]) => {
        updateBreadcrumbSegment(key, value);
      });
    }
  }, [initialBreadcrumbData, updateBreadcrumbSegment]);

  return (
    <div>
      <RaidDetail
        raidId={raidId}
        raidData={raidData}
        showEditButton={showEditButton}
      />
    </div>
  );
}
