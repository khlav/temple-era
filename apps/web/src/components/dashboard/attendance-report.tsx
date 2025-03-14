"use client";

import React, { useEffect } from "react";
import { api } from "~/trpc/react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import { type ChartConfig } from "@/components/ui/chart";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { useRouter } from "next/navigation";
import type { ValueType } from "recharts/types/component/DefaultTooltipContent";
import {Tooltip, TooltipContent, TooltipTrigger} from "~/components/ui/tooltip";
import {HelpCircle} from "lucide-react";

interface Raider {
  name: string | null;
  characterId: number | null;
  weightedAttendance: number | null;
  weightedRaidTotal: number | null;
  weightedAttendancePct: number | null;
}

export function AttendanceReport({
  currentUserCharacterId,
}: {
  currentUserCharacterId?: number;
}) {
  const attendanceThreshold = 0.4;
  const minDisplayThreshold = 0.1;
  const router = useRouter();
  const [chartAttendenceData, setChartAttendenceData] = React.useState<
    Raider[]
  >([]);
  const { data: attendanceData, isSuccess } =
    api.dashboard.getPrimaryRaidAttendanceL6LockoutWk.useQuery();

  useEffect(() => {
    if (isSuccess) {
      const attendanceDataFiltered = attendanceData.filter(
        (raider) => (raider.weightedAttendancePct ?? 0) >= minDisplayThreshold
      );
      const raiderData = attendanceDataFiltered.map((raider) => {
        const raiderPct = raider.weightedAttendancePct ?? 0;
        return {
          ...raider,
          weightedAttendancePctAtOrAboveThresh: raiderPct >= attendanceThreshold && currentUserCharacterId !== raider.characterId ? raiderPct : null,
          weightedAttendancePctAtOrAboveThreshHighlight: raiderPct >= attendanceThreshold && currentUserCharacterId === raider.characterId ? raiderPct : null,
          weightedAttendancePctBelowThresh: raiderPct < attendanceThreshold && currentUserCharacterId !== raider.characterId ? raiderPct : null,
          weightedAttendancePctBelowThreshHighlight: raiderPct < attendanceThreshold  && currentUserCharacterId === raider.characterId ? raiderPct : null,
        };
      });
      setChartAttendenceData(raiderData);
    }
  }, [attendanceData, currentUserCharacterId, isSuccess]);

  const chartConfig = {
    weightedAttendancePctAtOrAboveThresh: {
      label: "% Attendance",
      color: "hsl(var(--primary))",
    },
    weightedAttendancePctAtOrAboveThreshHighlight: {
      label: "% Attendance",
      color: "hsl(var(--chart-2))",
    },
    weightedAttendancePctBelowThresh: {
      label: "% Attendance",
      color: "hsl(var(--muted))",
    },
    weightedAttendancePctBelowThreshHighlight: {
      label: "% Attendance",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  const handleBarClick = (data: Raider) => {
    console.log(data);
    if (data.characterId) {
      router.push(`/characters/${data.characterId}`);
    }
  };

  const renderCustomTick = ({
    x,
    y,
    payload,
  }: {
    x: number;
    y: number;
    payload: { index: number; value: string };
  }) => {
    const character = chartAttendenceData[payload.index];
    const isHighlighted = currentUserCharacterId === character?.characterId;
    return (
      <text
        x={x}
        y={y}
        style={{
          fill: isHighlighted ? "hsl(var(--chart-2))" : undefined,
        }}
        fontWeight={isHighlighted ? "bold" : "normal"}
        textAnchor="end"
        alignmentBaseline="middle"
      >
        {payload?.value}
      </text>
    );
  };

  return (
    <Card className="min-h-[1700px]">
      <CardHeader>
        <div className="flex flex-row gap-1">
          <div className="grow-0">Tracked raid attendance %</div>
          <div className="grow pt-1 text-muted-foreground">
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle size="16" />
              </TooltipTrigger>
              <TooltipContent
                side="right"
                className="rounded-md bg-secondary text-muted-foreground"
              >
                <div>Each week, raiders can earn up to 3pts:</div>
                <div className="pt-1">
                  - Naxx, AQ40, BWL : +1
                  <br />
                  - Molten Core : +0.5
                </div>
                <div className="italic">Note: Points are only earned once per zone+week.</div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="pb-0.5 text-sm text-muted-foreground">
          Last 6 full lockouts
          {chartAttendenceData &&
            chartAttendenceData.length > 0 &&
            `, ${chartAttendenceData.length} raiders attending 10%+`}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isSuccess ? (
          <div>
            <ChartContainer
              config={chartConfig}
              className="min-h-600 mx-auto h-[2000px] w-[320px] pr-4"
            >
              <BarChart
                accessibilityLayer
                data={chartAttendenceData}
                layout="vertical"
                margin={{
                  left: 35,
                }}
              >
                <XAxis
                  type="number"
                  dataKey="weightedAttendancePctAtOrAboveThresh"
                  domain={[0, 1]}
                  tickFormatter={(value) => `${Math.round(value * 100)}%`}
                  hide
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  // tickFormatter={(value: string) => value.slice(0, 3)}
                  tick={renderCustomTick}
                />
                <ChartTooltip
                  // formatter={chartTooltip}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      valueFormatter={(value: ValueType) => (
                        <div className="inline-block pl-1">
                          {Math.round(parseFloat(value.toString()) * 1000) / 10}
                          %
                        </div>
                      )}
                      additionalContentFromItem={(item: {
                        payload: {
                          raidsAttended: {
                            name: string;
                            date: Date;
                            attendeeOrBench: string;
                          }[];
                        };
                      }) => {
                        return (
                          <></>
                          // <div>
                          //   <Separator className="mb-1 mt-2 bg-muted-foreground" />
                          //   <div>Raids:</div>
                          //   {item.payload?.raidsAttended
                          //     .sort((a, b) => (a.date > b.date ? -1 : 1))
                          //     .map((raid: { name: string, attendeeOrBench: string }, i) => (
                          //       <div key={i} className="pl-1 text-nowrap">
                          //         - {raid.name} {raid.attendeeOrBench === "bench" ? <span className="text-xs text-muted-foreground">Bench</span> : ""}
                          //       </div>
                          //     ))}
                          // </div>
                        );
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="weightedAttendancePctAtOrAboveThresh"
                  fill="var(--color-weightedAttendancePctAtOrAboveThresh)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={(data: Raider) => handleBarClick(data)}
                >
                  <LabelList
                    dataKey="weightedAttendancePctAtOrAboveThresh"
                    position="insideRight"
                    offset={8}
                    className="fill-primary-foreground font-bold"
                    fontSize={12}
                    formatter={(value: number) => `${Math.round(value * 100)}%`}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendancePctAtOrAboveThreshHighlight"
                  fill="var(--color-weightedAttendancePctAtOrAboveThreshHighlight)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={(data: Raider) => handleBarClick(data)}
                >
                  <LabelList
                    dataKey="weightedAttendancePctAtOrAboveThreshHighlight"
                    position="insideRight"
                    offset={8}
                    className="fill-background font-bold"
                    fontSize={12}
                    formatter={(value: number) => `${Math.round(value * 100)}%`}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendancePctBelowThresh"
                  fill="var(--color-weightedAttendancePctBelowThresh)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={(data: Raider) => handleBarClick(data)}
                >
                  <LabelList
                    dataKey="weightedAttendancePctBelowThresh"
                    position="right"
                    offset={8}
                    className="fill-muted-foreground"
                    fontSize={12}
                    formatter={(value: number) => `${Math.round(value * 100)}%`}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendancePctBelowThreshHighlight"
                  fill="var(--color-weightedAttendancePctBelowThreshHighlight)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={(data: Raider) => handleBarClick(data)}
                >
                  <LabelList
                    dataKey="weightedAttendancePctBelowThreshHighlight"
                    position="right"
                    offset={8}
                    className="fill-muted-foreground"
                    fontSize={12}
                    formatter={(value: number) => `${Math.round(value * 100)}%`}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>

            {/*/!* RAW DATA *!/*/}
            {/*<div className="max-h-[300px] overflow-hidden overflow-y-auto">*/}
            {/*  <LabeledArrayCodeBlock*/}
            {/*    label=""*/}
            {/*    value={JSON.stringify(attendanceData, null, 2)}*/}
            {/*  />*/}
            {/*</div>*/}
          </div>
        ) : (
          "Loading..."
        )}
      </CardContent>
    </Card>
  );
}
