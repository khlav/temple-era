"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";
import { Separator } from "~/components/ui/separator";
import { CharactersTable } from "~/components/players/characters-table";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";
import React from "react";

export function RaidDetailBase({
  raidData,
  showEditButton,
  isPreview,
}: {
  raidData: Raid;
  showEditButton?: boolean;
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

  const curPath = usePathname();

  return (
    <div className="px-3">
      <div className="flex gap-2 pb-0">
        <div className="grow-0 text-xl md:text-3xl font-bold">
          <div>{raidData.name}</div>
          <div className="text-sm text-muted-foreground font-normal">
            {new Date(raidData.date).toLocaleDateString("en-US", {
              timeZone: "UTC",
              month: "long",
              day: "numeric",
              weekday: "short",
              year: "numeric",
            })}
          </div>
        </div>
        <div className="grow" />
        <div className="align-right text-muted-foreground grow-0">
          <div className="whitespace-nowrap text-sm md:text-md">{raidData.zone}</div>
          <div className="text-right">
            <RaidAttendenceWeightBadge
              attendanceWeight={raidData.attendanceWeight}
            />
          </div>
        </div>
        {showEditButton && (
          <div className="my-auto grow-0">
            <Link href={curPath + "/edit"}>
              <Button className="py-6">
                <Edit />
                Edit
              </Button>
            </Link>
          </div>
        )}
      </div>

      <Separator className="my-3" />
      <div className="flex gap-4 xl:flex-nowrap">
        <div className="grow-0 text-nowrap text-sm">WCL logs:</div>
        <div className="shrink overflow-x-hidden">
          {(raidData.raidLogIds ?? []).map((raidLogId) => {
            const reportUrl = GenerateWCLReportUrl(raidLogId);
            return (
              <div
                key={raidLogId}
                className="text-muted-foreground hover:text-primary  text-sm transition-all duration-100 hover:underline"
              >
                <Link
                  href={reportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="hidden md:inline-block">
                    {reportUrl.replace("https://", "")}
                  </span>
                  <span className="inline-block md:hidden">{raidLogId}</span>
                  <ExternalLinkIcon
                    className="ml-1 align-text-top inline-block"
                    size={15}
                  />
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-3" />
      <div className="flex flex-wrap gap-2 py-1 xl:flex-nowrap">
        <div className="w-full xl:w-1/2">
          <div className="bg-card text-card-foreground rounded-xl border p-3 shadow">
            <div className="text-xl">Attendees from logs:</div>
            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              {isSuccessParticipants && (
                <CharactersTable characters={raidParticipants} />
              )}
            </div>
            <div className="text-muted-foreground text-center text-sm">
              List of characters appearing in WCL logs. <br />
              Alts are mapped to primary characters when calc&apos;ing
              attendance.
            </div>
          </div>
        </div>
        <div className="w-full xl:w-1/2">
          <div className="bg-card text-card-foreground rounded-xl border p-3 shadow">
            <div className="text-xl">Bench:</div>
            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              <CharactersTable characters={raidData.bench} />
            </div>
            <Separator className="m-auto my-3" />
            <div className="text-muted-foreground text-center text-sm">
              Characters available for raid but not appearing in logs (e.g. raid
              was full).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
