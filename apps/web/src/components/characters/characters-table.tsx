"use client";

import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import anyAscii from "any-ascii";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import { GenericCharactersTableSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";
import {ClassIcon} from "~/components/ui/class-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import React from "react";

// Define the 40-man instances in the required order
const FORTY_MAN_INSTANCES = [
  "Molten Core",
  "Blackwing Lair", 
  "Temple of Ahn'Qiraj",
  "Naxxramas"
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

  const tooltipContent = bench > 0 
    ? `Raids attended: ${attendee}\nBench: ${bench}`
    : `Raids attended: ${attendee}`;

  return (
    <>
      <span className="hidden md:inline">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="cursor-help">{formatAttendance(attendee, bench)}</span>
          </TooltipTrigger>
          <TooltipContent side="top" className="rounded bg-secondary text-muted-foreground px-3 py-1 text-xs shadow transition-all whitespace-pre-line">
            {tooltipContent}
          </TooltipContent>
        </Tooltip>
      </span>
      <span className="md:hidden">{formatAttendanceMobile(attendee, bench)}</span>
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
}: {
  characters: RaidParticipantCollection | undefined;
  targetNewTab?: boolean;
  isLoading?: boolean;
  session?: Session;
}) {
  const characterList =
    characters &&
    Object.values(characters).sort((a, b) =>
      anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
    );

  return (
    <div>
      {isLoading ? (
        <GenericCharactersTableSkeleton rows={13} />
      ) : (
        <Table className="max-h-[400px] w-full">
          <TableHeader>
            <TableRow>
              {session?.user?.isRaidManager && (
                <TableHead className="w-40"> </TableHead>
              )}
              <TableHead className="w-1/2">
                Characters {characterList && `(${characterList.length})`}
              </TableHead>
              <TableHead className="w-1/4">Server</TableHead>
              {FORTY_MAN_INSTANCES.map((zone) => (
                <TableHead key={zone} className="w-16 text-center text-xs">
                  {zone === "Molten Core" ? "MC" : 
                   zone === "Blackwing Lair" ? "BWL" :
                   zone === "Temple of Ahn'Qiraj" ? "AQ40" :
                   "Naxx"}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {characterList
              ? characterList?.map((c: RaidParticipant) => (
                  <TableRow key={c.characterId} className="group">
                    {session?.user?.isRaidManager && (
                      <TableCell>
                        <Link
                          href={`/raid-manager/characters?s=${c.name}`}
                          className="transition-all hover:text-primary"
                        >
                          <Edit
                            className="opacity-0 group-hover:opacity-100"
                            size={16}
                          />
                        </Link>
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        className="group w-full transition-all hover:text-primary"
                        target={targetNewTab ? "_blank" : "_self"}
                        href={"/characters/" + c.characterId}
                      >
                        <div className="flex flex-row">
                          <ClassIcon characterClass={c.class.toLowerCase()} px={20} className="grow-0 mr-1" />
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
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.server}
                    </TableCell>
                    {FORTY_MAN_INSTANCES.map((zone) => {
                      const attendance = c.raidAttendanceByZone?.[zone];
                      const attendee = attendance?.attendee ?? 0;
                      const bench = attendance?.bench ?? 0;
                      
                      return (
                        <TableCell key={zone} className={`text-center text-xs whitespace-nowrap ${getAttendanceStyling(attendee)}`}>
                          {renderAttendanceWithTooltips(attendee, bench)}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
