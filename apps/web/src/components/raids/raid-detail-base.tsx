"use client"

import type { Raid } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";
import { Separator } from "~/components/ui/separator";
import { CharactersTable } from "~/components/players/characters-table";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import {GenerateWCLReportUrl} from "~/lib/helpers";
import Link from "next/link";
import {ExternalLinkIcon} from "lucide-react";

export function RaidDetailBase({
  raidData,
  isPreview,
}: {
  raidData: Raid;
  isPreview?: boolean;
}) {
  const {
    data: raidParticipants,
    isSuccess: isSuccessParticipants,
    isLoading: isLoadingParticipants,
    isError: isErrorParticipants,
  } = api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(
    raidData.raidLogIds ?? [],
    { enabled: !!raidData },
  );


  return (
    <div className={`${isPreview ? "bg-stone-900" : ""} rounded-xl inline`}>
      <div className="flex gap-2 pb-0">
        <div className="text-primary grow text-3xl font-bold">
          {raidData.name}
        </div>
        <div className="grow-0 align-middle">
          {raidData.zone}
          <span> - </span>
          {new Date(raidData.date).toLocaleDateString("en-US", {
            timeZone: "UTC",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
          <div className="text-right">
            <RaidAttendenceWeightBadge
              attendanceWeight={raidData.attendanceWeight}
            />
          </div>
          {}
        </div>
      </div>

      <Separator className="my-3" />
      <div className="flex gap-4 xl:flex-nowrap">
        <div className="grow-0 text-sm text-nowrap">WCL reports:</div>
        <div className="shrink overflow-x-hidden">
          {(raidData.raidLogIds ?? []).map((raidLogId) => {
            const reportUrl = GenerateWCLReportUrl(raidLogId)
            return (
              <div key={raidLogId}
                   className="text-muted-foreground text-sm hover:underline hover:text-primary transition-all duration-100 group">
                <Link href={reportUrl} target="_blank" rel="noopener noreferrer">
                  {reportUrl}
                  <ExternalLinkIcon className="hidden group-hover:inline-block ml-1 align-text-top " size={15}/>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-3"/>
      <div className="flex flex-wrap gap-2 p-3 xl:flex-nowrap">
        <div className="w-full xl:w-1/2">
          <div className="bg-card text-card-foreground rounded-xl border p-3 shadow">
            <div className="text-xl">Attendees from logs:</div>
            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              {isSuccessParticipants && (
                <CharactersTable characters={raidParticipants}/>
              )}
            </div>
            <div className="text-muted-foreground text-center text-sm">
              List of characters appearing in WCL logs. <br/>
              Alts are mapped to primary characters when calc'ing attendance.
            </div>
          </div>
        </div>
        <div className="w-full xl:w-1/2">
          <div className="bg-card text-card-foreground rounded-xl border p-3 shadow">
            <div className="text-xl">Bench:</div>
            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              <CharactersTable characters={raidData.bench}/>
            </div>
            <Separator className="m-auto my-3"/>
            <div className="text-muted-foreground text-center text-sm">
              Characters available for raid but not appearing in logs (e.g. raid was full).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
