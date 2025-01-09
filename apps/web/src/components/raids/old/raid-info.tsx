"use client";
import { api } from "~/trpc/react";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";

export function RaidInfo({raidId}: {raidId: number}) {
  const { data: raidDetail, isLoading, isError, error } = api.raid.getRaidById.useQuery(raidId);
  const { data: raidLogs } = api.raidLog.getRaidLogsByRaidId.useQuery(raidId);
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
          <LabeledArrayCodeBlock label="Raid Attendees" value={attendees} />
        </div>
      )}
    </div>
  );
}
