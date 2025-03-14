"use client";

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import Link from "next/link";
import {Armchair, ExternalLinkIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { PrimaryCharacterRaidsTableRowSkeleton } from "~/components/characters/skeletons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

export function PrimaryCharacterRaidsTable({
  characterId,
}: {
  characterId: number;
}) {
  const { data: raids, isSuccess } =
    api.character.getRaidsForPrimaryCharacterId.useQuery(characterId);

  return (
    <div>
      <div>All-time raids attended: {raids && `${raids.length}`}</div>

      <Table className="max-h-[400px] whitespace-nowrap text-muted-foreground">
        <TableCaption className="text-wrap">
          Note: Only Tracked raids are considered for attendance restrictions.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/2 md:w-4/12">Raid</TableHead>
            <TableHead className="hidden md:table-cell md:w-2/12">
              Zone
            </TableHead>
            <TableHead className="hidden md:table-cell md:w-2/12">
              Date
            </TableHead>
            <TableHead className="w-1/4 md:w-2/12">Attendance</TableHead>
            <TableHead className="hidden md:table-cell md:w-1/12">
              Character
            </TableHead>
            <TableHead className="w-1/4 text-center md:w-1/12">WCL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isSuccess ? (
            raids.map((r) => (
              <TableRow key={r.raidId}>
                <TableCell className="text-secondary-foreground">
                  <Link
                    className="group w-full transition-all hover:text-primary"
                    target="_self"
                    href={"/raids/" + r.raidId}
                  >
                    <div>{r.name}</div>
                    <div className="text-xs text-muted-foreground md:hidden">
                      {PrettyPrintDate(new Date(r.date), true)}
                    </div>
                    <div className="mt-1 flex gap-1 text-xs text-muted-foreground md:hidden">
                      {(r.allCharacters ?? []).map((c) => (
                        <div
                          key={c.characterId}
                          className="grow-0 rounded bg-secondary px-2 py-1"
                        >
                          {c.name}
                        </div>
                      ))}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">{r.zone}</TableCell>
                <TableCell className="hidden md:table-cell">
                  {PrettyPrintDate(new Date(r.date), true)}
                </TableCell>
                <TableCell>
                  <RaidAttendenceWeightBadge
                    attendanceWeight={r.attendanceWeight}
                  />
                </TableCell>
                <TableCell className="hidden gap-1 md:flex">
                  {r.attendeeOrBench == "bench" && (
                    <Tooltip>
                      <TooltipTrigger>
                        <Armchair size={16} className="cursor-default"/>
                      </TooltipTrigger>
                      <TooltipContent className="bg-secondary text-muted-foreground">
                        Bench
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {(r.allCharacters ?? []).map((c) => {
                    return (
                      <Link
                        key={c.characterId}
                        className="group shrink rounded bg-secondary px-2 py-1 text-xs transition-all hover:text-primary"
                        target="_self"
                        href={"/characters/" + c.characterId}
                      >
                        {c.name}
                      </Link>
                    );
                  })}
                </TableCell>
                <TableCell className="text-center">
                  {(r.raidLogIds ?? []).map((raidLogId: string) => {
                    const reportUrl = GenerateWCLReportUrl(raidLogId);
                    return (
                      <Link
                        key={raidLogId}
                        href={reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group text-sm transition-all hover:text-primary hover:underline"
                      >
                        <ExternalLinkIcon
                          className="ml-1 inline-block align-text-top"
                          size={15}
                        />
                      </Link>
                    );
                  })}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <PrimaryCharacterRaidsTableRowSkeleton />
          )}
        </TableBody>
      </Table>
    </div>
  );
}
