"use client";
import { api } from "~/trpc/react";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";

export function RaidInfo({raidId}: {raidId: number}) {
  const { data: raidDetail, isLoading, isError, error } = api.raid.getRaidById.useQuery(raidId);
  const { data: raidLogs } = api.raidLog.getRaidLogsByRaidId.useQuery(raidId);
  const { data: attendees } = api.raid.getAttendeesByRaidId.useQuery(raidId);

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
          <LabeledArrayCodeBlock label="Raids" value={JSON.stringify(raidDetail, null, 2)}/>
          <LabeledArrayCodeBlock label="WCL Logs" value={JSON.stringify(raidLogs, null, 2)}/>
          <LabeledArrayCodeBlock label="Raid Attendees" value={JSON.stringify(attendees, null, 2)} />
        </div>
      )}
    </div>
  );
}
