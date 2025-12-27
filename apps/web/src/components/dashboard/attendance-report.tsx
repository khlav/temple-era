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
import {
  Bar,
  BarChart,
  LabelList,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";
import type { ValueType } from "recharts/types/component/DefaultTooltipContent";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

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
  const attendanceThreshold = 9; // Changed from 0.4 to 7 (integer threshold)
  const minDisplayThreshold = 2; // Changed from 0.1 to 2 (integer threshold)
  const targetAttendance = 9; // Reference line at 9 points
  const router = useRouter();
  const [chartAttendenceData, setChartAttendenceData] = React.useState<
    Raider[]
  >([]);
  const { data: attendanceData, isSuccess } =
    api.character.getAllPrimaryRaidAttendanceL6LockoutWk.useQuery();

  useEffect(() => {
    if (isSuccess) {
      const attendanceDataFiltered = attendanceData.filter(
        (raider) => (raider.weightedAttendance ?? 0) >= minDisplayThreshold,
      );
      const raiderData = attendanceDataFiltered.map((raider) => {
        const raiderAttendance = raider.weightedAttendance ?? 0;
        return {
          ...raider,
          weightedAttendanceAtOrAboveThresh:
            raiderAttendance >= attendanceThreshold &&
            currentUserCharacterId !== raider.characterId
              ? raiderAttendance
              : null,
          weightedAttendanceAtOrAboveThreshHighlight:
            raiderAttendance >= attendanceThreshold &&
            currentUserCharacterId === raider.characterId
              ? raiderAttendance
              : null,
          weightedAttendanceBelowThresh:
            raiderAttendance < attendanceThreshold &&
            currentUserCharacterId !== raider.characterId
              ? raiderAttendance
              : null,
          weightedAttendanceBelowThreshHighlight:
            raiderAttendance < attendanceThreshold &&
            currentUserCharacterId === raider.characterId
              ? raiderAttendance
              : null,
        };
      });
      setChartAttendenceData(raiderData);
    }
  }, [attendanceData, currentUserCharacterId, isSuccess]);

  const chartConfig = {
    weightedAttendanceAtOrAboveThresh: {
      label: "Attendance",
      color: "hsl(var(--primary))",
    },
    weightedAttendanceAtOrAboveThreshHighlight: {
      label: "Attendance",
      color: "hsl(var(--chart-2))",
    },
    weightedAttendanceBelowThresh: {
      label: "Attendance",
      color: "hsl(var(--muted))",
    },
    weightedAttendanceBelowThreshHighlight: {
      label: "Attendance",
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig;

  const handleBarClick = (data: any, index: number) => {
    if (process.env.NODE_ENV === "development") {
      console.log(data);
    }
    // Extract the raider data from the chart data using the index
    const raider = chartAttendenceData[index];
    if (raider?.characterId) {
      router.push(`/characters/${raider.characterId}`);
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
          <div className="grow-0">Raid Attendance Leaderboard</div>
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
                  <br />- Molten Core : +0.5
                </div>
                <div className="italic">
                  Note: Points are only earned once per zone+week.
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="pb-0.5 text-sm text-muted-foreground">
          Last 6 full lockouts -- 50%+ = able to SR
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
                  dataKey="weightedAttendanceAtOrAboveThresh"
                  domain={[0, 18]}
                  tickFormatter={(value) => `${value}`}
                  hide
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                  tick={renderCustomTick}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      valueFormatter={(value: ValueType) => (
                        <div className="inline-block pl-1">
                          {parseFloat(value.toString())} of 18
                        </div>
                      )}
                      additionalContentFromItem={() => <></>}
                    />
                  }
                />
                {/* Reference Line at 9 pts */}
                <ReferenceLine
                  x={targetAttendance}
                  stroke="#666"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  label={{
                    value: "50% attendance credit",
                    position: "top",
                    fill: "#666",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="weightedAttendanceAtOrAboveThresh"
                  fill="var(--color-weightedAttendanceAtOrAboveThresh)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={handleBarClick}
                >
                  <LabelList
                    dataKey="weightedAttendanceAtOrAboveThresh"
                    position="insideRight"
                    offset={8}
                    className="fill-primary-foreground font-bold"
                    fontSize={12}
                    style={{ pointerEvents: "none" }}
                    formatter={(label: any) => {
                      const value =
                        typeof label === "number" ? label : parseFloat(label);
                      return `${Math.round((value / 18) * 100)}%`;
                    }}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendanceAtOrAboveThreshHighlight"
                  fill="var(--color-weightedAttendanceAtOrAboveThreshHighlight)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={handleBarClick}
                >
                  <LabelList
                    dataKey="weightedAttendanceAtOrAboveThreshHighlight"
                    position="insideRight"
                    offset={8}
                    className="fill-background font-bold"
                    fontSize={12}
                    style={{ pointerEvents: "none" }}
                    formatter={(label: any) => {
                      const value =
                        typeof label === "number" ? label : parseFloat(label);
                      return `${Math.round((value / 18) * 100)}%`;
                    }}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendanceBelowThresh"
                  fill="var(--color-weightedAttendanceBelowThresh)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={handleBarClick}
                >
                  <LabelList
                    dataKey="weightedAttendanceBelowThresh"
                    position="right"
                    offset={8}
                    className="fill-muted-foreground"
                    fontSize={12}
                    style={{ pointerEvents: "none" }}
                    formatter={(label: any) => {
                      const value =
                        typeof label === "number" ? label : parseFloat(label);
                      return `${Math.round((value / 18) * 100)}%`;
                    }}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendanceBelowThreshHighlight"
                  fill="var(--color-weightedAttendanceBelowThreshHighlight)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={handleBarClick}
                >
                  <LabelList
                    dataKey="weightedAttendanceBelowThreshHighlight"
                    position="right"
                    offset={8}
                    className="fill-muted-foreground"
                    fontSize={12}
                    style={{ pointerEvents: "none" }}
                    formatter={(label: any) => {
                      const value =
                        typeof label === "number" ? label : parseFloat(label);
                      return `${Math.round((value / 18) * 100)}%`;
                    }}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        ) : (
          "Loading..."
        )}
      </CardContent>
    </Card>
  );
}
