"use client";
import { api } from "~/trpc/react";
import Link from "next/link";
import LabeledArrayCodeBlock from "~/app/ui/misc/codeblock";

export function RaidDetail({raidId}: {raidId: number}) {
  const { data: raidDetail, isLoading, isError, error } = api.raid.getRaidById.useQuery(raidId);
  const { data: raidLogs } = api.raid.getRaidLogsByRaidId.useQuery(raidId);
  const { data: attendees } = api.raid.getRaidAttendeesByRaidId.useQuery(raidId);

  return (
    <div>
      {isLoading && (
        <div className="w-full flex justify-center items-center">
          <p>Loading...</p>
        </div>
      )}

      {isError && (
        <div className="w-full text-center text-red-500">
          Error: {error.message}
        </div>
      )}

      {raidDetail && raidLogs && attendees && (
        <div>
          <LabeledArrayCodeBlock label="Raids" value={raidDetail}/>
          <LabeledArrayCodeBlock label="WCL Logs" value={raidLogs}/>
          <LabeledArrayCodeBlock label="WCL Log Attendees" value={attendees} />
        </div>
      )}
    </div>
  )
    ;
}
