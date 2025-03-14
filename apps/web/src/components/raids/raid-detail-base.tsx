"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import { api } from "~/trpc/react";
import { Separator } from "~/components/ui/separator";
import { CharactersTable } from "~/components/characters/characters-table";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "~/components/ui/button";
import React from "react";
import UserAvatar from "~/components/ui/user-avatar";
import { CharacterSummaryGrid} from "~/components/characters/character-summary-grid";

export function RaidDetailBase({
  raidData,
  showEditButton,
}: {
  raidData: Raid;
  showEditButton?: boolean;
  isPreview?: boolean;
}) {
  const { data: raidParticipants, isLoading: isLoadingParticipants } =
    api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(
      raidData.raidLogIds ?? [],
      { enabled: !!raidData },
    );

  const curPath = usePathname();

  return (
    <div className="px-3">
      <div className="flex gap-2 pb-0">
        <div className="grow-0 text-xl font-bold md:text-3xl">
          <div>{raidData.name}</div>
          <div className="text-nowrap text-sm font-normal text-muted-foreground">
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
        <div className="align-right grow-0 text-muted-foreground">
          <div className="nowrap text-right">
            <RaidAttendenceWeightBadge
              attendanceWeight={raidData.attendanceWeight}
            />
          </div>
          <div className="md:text-md whitespace-nowrap text-sm">
            {raidData.zone}
          </div>
        </div>
        {showEditButton && (
          <div className="grow-0 align-text-top">
            <Link href={curPath + "/edit"}>
              <Button className="py-5">
                <Edit />
                Edit
              </Button>
            </Link>
          </div>
        )}
      </div>

      <Separator className="my-3" />
      <div className="flex items-center gap-4">
        {/* WCL Logs */}
        <div className="grow-0 whitespace-nowrap text-sm">WCL logs:</div>
        <div className="flex grow items-center gap-2 overflow-x-hidden">
          {(raidData.raidLogIds ?? []).map((raidLogId) => {
            const reportUrl = GenerateWCLReportUrl(raidLogId);
            return (
              <div
                key={raidLogId}
                className="text-sm text-muted-foreground transition-all duration-100 hover:text-primary hover:underline"
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
                    className="ml-1 inline-block align-text-top"
                    size={15}
                  />
                </Link>
              </div>
            );
          })}
        </div>

        {/* Creator Info */}
        <div className="flex grow-0 items-center gap-2 whitespace-nowrap text-sm">
          <div className="text-sm text-muted-foreground">Created by</div>
          <UserAvatar
            name={raidData.creator?.name ?? ""}
            image={raidData.creator?.image ?? ""}
            tooltipSide="left"
            showLabel={false}
          />
        </div>
      </div>

      <Separator className="my-3" />
      <div className="flex gap-2 xl:flex-nowrap">
        <div className="grow-0 text-nowrap py-[3px] text-sm">
          Kills {raidData.kills ? `(${raidData?.kills?.length})` : ""}:
        </div>
        <div className="flex shrink flex-wrap gap-1 overflow-x-hidden text-nowrap">
          {(raidData.kills ?? []).map((killName, i) => {
            return (
              <div
                key={`kill_${i}`}
                className="grow-0 rounded bg-secondary px-2 py-1 text-sm text-muted-foreground"
              >
                {killName}
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="my-3" />
      <div className="flex flex-wrap gap-2 py-1 xl:flex-nowrap">
        <div className="w-full xl:w-1/2">
          <div className="rounded-xl border bg-card p-3 text-card-foreground shadow">
            <div className="text-xl">Attendees from logs:</div>
            <div className="my-1 flex justify-center">
              <CharacterSummaryGrid
                characters={raidParticipants ?? {}}
                numRows={
                  Object.keys(raidParticipants ?? []).length > 25 ? 3 : 2
                }
              />
            </div>

            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              <CharactersTable
                characters={raidParticipants}
                isLoading={isLoadingParticipants}
              />
            </div>
            <div className="text-center text-sm text-muted-foreground">
              List of characters appearing in WCL logs. <br />
              Alts are mapped to primary characters when calc&apos;ing
              attendance.
            </div>
          </div>
        </div>
        <div className="w-full xl:w-1/2">
          <div className="rounded-xl border bg-card p-3 text-card-foreground shadow">
            <div className="text-xl">Bench:</div>
            <div className="max-h-[600px] overflow-x-auto overflow-y-auto">
              <CharactersTable characters={raidData.bench} />
            </div>
            <Separator className="m-auto my-3" />
            <div className="text-center text-sm text-muted-foreground">
              Characters available for raid but not appearing in logs (e.g. raid
              was full).
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
