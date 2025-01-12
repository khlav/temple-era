"use client";

import { api } from "~/trpc/react";
import {RaidsTable} from "~/components/raids/raids-table";
import {RaidsTableSkeleton} from "~/components/raids/skeletons";

export function AllRaids() {
  const {
    data: raids,
    isLoading,
  } = api.raid.getRaids.useQuery();

  return (
    <>
      {isLoading ? (
        <RaidsTableSkeleton rows={10}/>
      ) : (
        <div>
          <RaidsTable raids={raids} />
        </div>
      )}
    </>
  );
}
