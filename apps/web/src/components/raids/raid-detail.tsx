"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import { RaidDetailBase } from "~/components/raids/raid-detail-base";

export function RaidDetail({
  raidId: _raidId,
  raidData,
  showEditButton,
}: {
  raidId: number;
  raidData: Raid;
  showEditButton?: boolean;
}) {
  return (
    <div>
      <RaidDetailBase raidData={raidData} showEditButton={showEditButton} />
    </div>
  );
}
