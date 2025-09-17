"use client";

import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import anyAscii from "any-ascii";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import { GenericCharactersTableSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";
import { ClassIcon } from "~/components/ui/class-icon";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import React from "react";

// Define the 40-man instances in the required order
const FORTY_MAN_INSTANCES = [
  "Molten Core",
  "Blackwing Lair",
  "Temple of Ahn'Qiraj",
  "Naxxramas",
] as const;

// Helper function to format attendance display
const formatAttendance = (attendee: number, bench: number) => {
  if (attendee === 0 && bench === 0) {
    return "";
  }

  let display = attendee.toString();
  if (bench > 0) {
    display += ` (${bench})`;
  }

  return display;
};

// Helper function to format attendance display for mobile (without bench)
const formatAttendanceMobile = (attendee: number, bench: number) => {
  if (attendee === 0 && bench === 0) {
    return "";
  }

  return attendee.toString();
};

// Helper function to render attendance with tooltips
const renderAttendanceWithTooltips = (attendee: number, bench: number) => {
  if (attendee === 0 && bench === 0) {
    return "";
  }

  const tooltipContent =
    bench > 0
      ? `Attended: ${attendee}\nBench: ${bench}`
      : `Attended: ${attendee}`;

  return (
    <>
      <span className="hidden md:inline">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">
              {formatAttendance(attendee, bench)}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="whitespace-pre-line rounded bg-secondary px-3 py-1 text-xs text-muted-foreground shadow transition-all"
          >
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </span>
      <span className="md:hidden">
        {formatAttendanceMobile(attendee, bench)}
      </span>
    </>
  );
};

// Helper function to get attendance styling classes
const getAttendanceStyling = (attendee: number) => {
  if (attendee < 4) {
    return "text-muted-foreground italic";
  }
  return "";
};

export function CharactersTable({
  characters,
  targetNewTab = false,
  isLoading = false,
  session,
  showRaidColumns = true,
}: {
  characters: RaidParticipantCollection | undefined;
  targetNewTab?: boolean;
  isLoading?: boolean;
  session?: Session;
  showRaidColumns?: boolean;
}) {
  const characterList =
    characters &&
    Object.values(characters).sort((a, b) =>
      anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
    );

  return (
    <div className="max-h-[calc(100vh-200px)] min-h-[600px] overflow-y-auto overflow-x-hidden">
      {isLoading ? (
        <GenericCharactersTableSkeleton
          rows={13}
          showRaidColumns={showRaidColumns}
        />
      ) : (
        <div className="relative w-full">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-10 border-b bg-background [&_tr]:border-b">
              <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                {session?.user?.isRaidManager && (
                  <th className="h-10 grow-0 px-2 text-left align-middle font-medium text-muted-foreground">
                    {" "}
                  </th>
                )}
                <th className="h-10 w-1/2 px-2 text-left align-middle font-medium text-muted-foreground">
                  Characters {characterList && `(${characterList.length})`}
                </th>
                <th className="hidden h-10 grow px-2 text-left align-middle font-medium text-muted-foreground md:inline">
                  Server
                </th>
                {showRaidColumns &&
                  FORTY_MAN_INSTANCES.map((zone) => (
                    <th
                      key={zone}
                      className="h-10 w-16 px-2 text-left text-center align-middle text-xs font-medium text-muted-foreground"
                    >
                      {zone === "Molten Core"
                        ? "MC"
                        : zone === "Blackwing Lair"
                          ? "BWL"
                          : zone === "Temple of Ahn'Qiraj"
                            ? "AQ40"
                            : "Naxx"}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {characterList
                ? characterList?.map((c: RaidParticipant) => (
                    <tr
                      key={c.characterId}
                      className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      {session?.user?.isRaidManager && (
                        <td className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                          <Link
                            href={`/raid-manager/characters?s=${c.name}`}
                            className="transition-all hover:text-primary"
                          >
                            <Edit
                              className="opacity-0 group-hover:opacity-100"
                              size={16}
                            />
                          </Link>
                        </td>
                      )}
                      <td className="p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        <Link
                          className="group w-full transition-all hover:text-primary"
                          target={targetNewTab ? "_blank" : "_self"}
                          href={"/characters/" + c.characterId}
                        >
                          <div className="flex flex-row">
                            <ClassIcon
                              characterClass={c.class.toLowerCase()}
                              px={20}
                              className="mr-1 grow-0"
                            />
                            <div className="grow-0">{c.name}</div>
                            {c.primaryCharacterName ? (
                              <div className="pl-1.5 text-xs font-normal text-muted-foreground">
                                {c.primaryCharacterName}
                              </div>
                            ) : (
                              ""
                            )}
                            {targetNewTab && (
                              <ExternalLinkIcon
                                className="ml-1 hidden align-text-top group-hover:inline-block"
                                size={15}
                              />
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="hidden p-2 align-middle text-muted-foreground md:inline [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                        {c.server}
                      </td>
                      {showRaidColumns &&
                        FORTY_MAN_INSTANCES.map((zone) => {
                          const attendance = c.raidAttendanceByZone?.[zone];
                          const attendee = attendance?.attendee ?? 0;
                          const bench = attendance?.bench ?? 0;

                          return (
                            <td
                              key={zone}
                              className={`whitespace-nowrap p-2 text-center align-middle text-xs [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px] ${getAttendanceStyling(attendee)}`}
                            >
                              {renderAttendanceWithTooltips(attendee, bench)}
                            </td>
                          );
                        })}
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
