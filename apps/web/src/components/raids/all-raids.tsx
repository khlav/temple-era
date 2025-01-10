"use client";

import { api } from "~/trpc/react";
import {RaidsTable} from "~/components/raids/raids-table";

export function AllRaids() {
  const {
    data: raids,
    isLoading,
  } = api.raid.getRaids.useQuery();

  return (
    <>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div>
          <RaidsTable raids={raids} />
        </div>
      )}
    </>
  );
}
