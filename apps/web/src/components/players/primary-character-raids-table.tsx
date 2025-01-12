"use client";

import {
  Raid,
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import anyAscii from "any-ascii";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { api } from "~/trpc/react";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import { Badge } from "~/components/ui/badge";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import UserAvatar from "~/components/ui/user-avatar";
import {PrimaryCharacterRaidsTableRowSkeleton} from "~/components/players/skeletons";

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

      <Table className="text-muted-foreground max-h-[400px] whitespace-nowrap">
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
          {isSuccess
            ? raids.map((r, index) => (
                <TableRow key={r.raidId}>
                  <TableCell className="text-secondary-foreground">
                    <Link
                      className="hover:text-primary group w-full transition-all"
                      target="_self"
                      href={"/raids/" + r.raidId}
                    >
                      <div>{r.name}</div>
                      <div className="text-muted-foreground text-xs md:hidden">
                        {PrettyPrintDate(new Date(r.date), true)}
                      </div>
                      <div className="text-muted-foreground mt-1 flex gap-1 text-xs md:hidden">
                        {(r.allCharacters ?? []).map((c) => (
                          <div
                            key={c.characterId}
                            className="bg-secondary rounded px-2 py-1 grow-0"
                          >
                            {c.name}
                          </div>
                        ))}
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.zone}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {PrettyPrintDate(new Date(r.date), true)}
                  </TableCell>
                  <TableCell>
                    <RaidAttendenceWeightBadge
                      attendanceWeight={r.attendanceWeight}
                    />
                  </TableCell>
                  <TableCell className="hidden gap-1 md:flex">
                    {(r.allCharacters ?? []).map((c) => {
                      return (
                        <Link
                          key={c.characterId}
                          className="bg-secondary hover:text-primary group shrink rounded px-2 py-1 text-xs transition-all"
                          target="_self"
                          href={"/players/" + c.characterId}
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
                          className="hover:text-primary group text-sm transition-all hover:underline"
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
            : <PrimaryCharacterRaidsTableRowSkeleton/>}
        </TableBody>
      </Table>
    </div>
  );
}
