"use client";

import { useMemo } from "react";
import { Card, CardContent } from "~/components/ui/card";
import { XIcon } from "lucide-react";
import { AttendanceStatusIcon } from "~/components/ui/attendance-status-icon";
import { PrettyPrintDate } from "~/lib/helpers";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { Button } from "~/components/ui/button";
import { ClassIcon } from "~/components/ui/class-icon";
import { TableAddCharacterHeader } from "./table-add-character-header";

export function AttendanceReportTable({
  raids,
  characters,
  attendance,
  selectedCharacterIds,
  onAddCharacter,
  onRemoveCharacter,
}: {
  raids: Array<{ raidId: number; name: string; date: string; zone: string }>;
  characters: Array<{ characterId: number; name: string; class: string }>;
  attendance: Array<{
    raidId: number;
    primaryCharacterId: number;
    status: string | null;
  }>;
  selectedCharacterIds: number[];
  onAddCharacter: (characterId: number) => void;
  onRemoveCharacter: (characterId: number) => void;
}) {
  // Build attendance lookup map
  const attendanceMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const entry of attendance) {
      const key = `${entry.raidId}-${entry.primaryCharacterId}`;
      map.set(key, entry.status);
    }
    return map;
  }, [attendance]);

  const getAttendanceStatus = (
    raidId: number,
    characterId: number,
  ): "attendee" | "bench" | null => {
    const key = `${raidId}-${characterId}`;
    const status = attendanceMap.get(key);
    if (status === "attendee" || status === "bench") {
      return status;
    }
    return null;
  };

  if (raids.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="max-h-[calc(100vh-300px)] min-h-[600px] overflow-x-auto overflow-y-auto">
          <div className="relative w-full">
            <table className="w-full caption-bottom text-sm">
              <thead className="sticky top-0 z-10 border-b bg-background [&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="sticky left-0 z-20 h-10 w-[200px] min-w-[200px] max-w-[200px] border-r bg-background px-2 text-left align-middle font-medium text-muted-foreground">
                    Raids {raids ? `(${raids.length})` : ""}
                  </th>
                  {characters.map((char) => (
                    <th
                      key={char.characterId}
                      className="h-10 min-w-[150px] max-w-[300px] px-2 text-center align-middle font-medium text-muted-foreground"
                    >
                      <div className="flex items-center justify-center gap-2">
                        <ClassIcon characterClass={char.class} px={20} />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium">{char.name}</span>
                          </TooltipTrigger>
                          <TooltipContent className="bg-secondary text-muted-foreground">
                            {char.class}
                          </TooltipContent>
                        </Tooltip>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => onRemoveCharacter(char.characterId)}
                        >
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    </th>
                  ))}
                  {/* Add character column - always rightmost */}
                  <th className="h-10 w-full px-2 text-left align-middle font-medium text-muted-foreground">
                    <TableAddCharacterHeader
                      selectedCharacterIds={selectedCharacterIds}
                      onAddCharacter={onAddCharacter}
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {raids.map((raid) => (
                  <tr
                    key={raid.raidId}
                    className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                  >
                    <td className="sticky left-0 w-[200px] min-w-[200px] max-w-[200px] border-r bg-background p-2 align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      <Link
                        className="group w-full transition-all hover:text-primary"
                        target="_self"
                        href={"/raids/" + raid.raidId}
                      >
                        <div>{raid.name}</div>
                        <div className="text-xs tracking-tight text-muted-foreground">
                          {PrettyPrintDate(new Date(raid.date), true)}
                        </div>
                      </Link>
                    </td>
                    {characters.map((char) => {
                      const status = getAttendanceStatus(
                        raid.raidId,
                        char.characterId,
                      );
                      return (
                        <td
                          key={char.characterId}
                          className="min-w-[150px] max-w-[300px] p-2 text-center align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]"
                        >
                          <AttendanceStatusIcon
                            status={status}
                            size={20}
                            variant="inline"
                            iconClassName={
                              status === "attendee"
                                ? "text-chart-2"
                                : "text-muted-foreground"
                            }
                          />
                        </td>
                      );
                    })}
                    {/* Empty cell for add character column */}
                    <td className="w-full p-2 text-left align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                      {/* Empty - add column is header only */}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
