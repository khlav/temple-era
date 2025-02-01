"use client";

import type { RaidParticipant } from "~/server/api/interfaces/raid";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import React from "react";
import { api } from "~/trpc/react";
import type { inferRouterOutputs } from "@trpc/server";
import type { appRouter } from "~/server/api/root";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip"; // Import Tooltip from ShadCN UI
import clsx from "clsx";
import { PrettyPrintDate } from "~/lib/helpers";

// import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export const PrimaryCharacterAttendanceReport = ({
  character,
  debug = false,
}: {
  character: RaidParticipant;
  debug?: boolean;
}) => {
  type RouterOutput = inferRouterOutputs<typeof appRouter>;
  type AttendanceRecordList =
    RouterOutput["character"]["getRaidAttendanceReportForPrimaryCharacterId"];

  const { characterId } = character;

  const { data: attendanceData, isSuccess } =
    api.character.getRaidAttendanceReportForPrimaryCharacterId.useQuery(
      characterId,
    );

  const attendanceDataByWeek = (attendanceData ?? []).reduce(
    (acc, rel) => {
      const lockoutWeek = rel.lockoutWeek;
      (acc[lockoutWeek] = acc[lockoutWeek] ?? []).push(rel);
      return acc;
    },
    {} as Record<string, AttendanceRecordList>,
  );

  return (
    <>
      {isSuccess && (
        <>
          <div className="flex flex-row gap-0.5">
            {Object.keys(attendanceDataByWeek)
              .sort()
              .map((week) => (
                <div
                  key={`wk_${week}`}
                  className="flex grow-0 flex-col gap-0.5"
                >
                  {(attendanceDataByWeek[week] ?? [])
                    .sort((r1, r2) => (r1.date > r2.date ? 1 : -1))
                    .map((r) => {
                      // Define the background color and border color classes based on the participant status
                      const squareBgClass = clsx({
                        "bg-secondary": !r.isParticipant,
                        "bg-primary":
                          r.isParticipant && r.attendeeOrBench === "attendee",
                        "bg-muted-foreground":
                          r.isParticipant && r.attendeeOrBench === "bench",
                      });

                      const borderClass = clsx({
                        "border border-muted-foreground": !r.isParticipant,
                      });

                      // Text color class for TooltipContent
                      const textClass = clsx({
                        "text-muted-foreground": !r.isParticipant,
                        "text-primary-foreground":
                          r.isParticipant && r.attendeeOrBench === "attendee",
                        "text-muted":
                          r.isParticipant && r.attendeeOrBench === "bench",
                      });

                      return (
                        <Tooltip key={`r_${r.raidId}`}>
                          <TooltipTrigger>
                            <div
                              key={`r_${r.raidId}`}
                              className={clsx(
                                "h-3 w-3 rounded-sm",
                                squareBgClass,
                                borderClass,
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            sideOffset={15}
                            className={clsx(
                              "rounded-md p-2",
                              "pointer-events-none z-10",
                              squareBgClass,
                              textClass,
                              borderClass,
                            )}
                          >
                            <div className="flex flex-row gap-2">
                              <div className="grow-0 font-bold">{r.name}</div>
                              <div className="grow">{r.zone}</div>
                            </div>
                            <div>{PrettyPrintDate(new Date(r.date), true)}</div>
                            <div className="pt-1">
                              {r.isParticipant ? (
                                r.attendeeOrBench === "attendee" ? (
                                  <strong>Attended</strong>
                                ) : (
                                  <strong>Bench</strong>
                                )
                              ) : (
                                <i>Did not participate</i>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
                </div>
              ))}
          </div>
        </>
      )}
      {debug && isSuccess && (
        <div className="flex flex-row gap-2">
          <div className="grow-0">
            <LabeledArrayCodeBlock
              label="attendanceDataByWeek"
              value={JSON.stringify(attendanceDataByWeek, null, 2)}
              className="max-h-[400px] w-min pr-5 text-xs"
            />
          </div>
          <div className="grow-0">
            <LabeledArrayCodeBlock
              label="attendanceData"
              value={JSON.stringify(attendanceData, null, 2)}
              className="max-h-[400px] w-min pr-5 text-xs"
            />
          </div>
        </div>
      )}
    </>
  );
};
