"use client";

import { EditRaid } from "~/components/raids/edit-raid";
import { useBreadcrumb } from "~/components/nav/breadcrumb-context";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface RaidEditPageWrapperProps {
  raidId: number;
}

export function RaidEditPageWrapper({ raidId }: RaidEditPageWrapperProps) {
  const { updateBreadcrumbSegment } = useBreadcrumb();
  const { data: raidData, isSuccess } = api.raid.getRaidById.useQuery(raidId);

  useEffect(() => {
    if (isSuccess && raidData) {
      // Update breadcrumb with raid name for both the raid and edit segments
      updateBreadcrumbSegment(raidId.toString(), raidData.name);
      updateBreadcrumbSegment("edit", "Edit");
    }
  }, [isSuccess, raidData, raidId, updateBreadcrumbSegment]);

  return (
    <div>
      <EditRaid raidId={raidId} />
    </div>
  );
}
