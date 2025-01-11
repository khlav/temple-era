"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import React from "react";
import { api } from "~/trpc/react";

export function RecentTrackedRaids() {
  const {
    data: trackedRaidData,
    isLoading,
    isSuccess,
    isError,
  } = api.dashboard.getTrackedRaidsL6LockoutWk.useQuery();

  return (
    <div className="max-h-[700px] overflow-hidden overflow-y-auto">
      {isSuccess ? (
        <LabeledArrayCodeBlock
          label="Tracked Raids"
          value={JSON.stringify(trackedRaidData, null, 2)}
        />
      ) : (
        "Loading..."
      )}
    </div>
  );
}
