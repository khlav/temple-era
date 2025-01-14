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
  const router = useRouter();
  const [chartAttendenceData, setChartAttendenceData] = React.useState<
    Raider[]
  >([]);
  const { data: attendanceData, isSuccess } =
    api.dashboard.getPrimaryRaidAttendanceL6LockoutWk.useQuery();

  useEffect(() => {
    if (isSuccess) {
      const raiderData = attendanceData.map((raider) => {
        const raiderPct = raider.weightedAttendancePct ?? 0;
        return {
          ...raider,
          weightedAttendancePct50OrBetter: raiderPct >= 0.5 ? raiderPct : null,
          weightedAttendancePctLowerThan50: raiderPct >= 0.5 ? null : raiderPct,
        };
      });
      setChartAttendenceData(raiderData);
    }
  }, [attendanceData, isSuccess]);

  const chartConfig = {
    weightedAttendancePct: {
      label: "% Attendance",
      color: "hsl(var(--primary))",
    },
    weightedAttendancePct50OrBetter: {
      label: "% Attendance",
      color: "hsl(var(--primary))",
    },
    weightedAttendancePctLowerThan50: {
      label: "% Attendance",
      color: "hsl(var(--border))",
    },
  } satisfies ChartConfig;

  const handleBarClick = (data: Raider) => {
    console.log(data);
    if (data.characterId) {
      router.push(`/players/${data.characterId}`);
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
          fill: isHighlighted ? "hsl(var(--primary))" : undefined,
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
        <div className="">Tracked raid attendance %</div>
        <div className="text-muted-foreground pb-0.5 text-sm">
          Last 6 full lockouts
          {chartAttendenceData &&
            chartAttendenceData.length > 0 &&
            `, ${chartAttendenceData.length} raiders participating`}
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isSuccess ? (
          <div>
            <ChartContainer
              config={chartConfig}
              className="min-h-600 mx-auto h-[1500px] w-[320px] pr-4"
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
                  dataKey="weightedAttendancePct50OrBetter"
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
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Bar
                  dataKey="weightedAttendancePct50OrBetter"
                  fill="var(--color-weightedAttendancePct50OrBetter)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={(data: Raider) => handleBarClick(data)}
                >
                  <LabelList
                    dataKey="weightedAttendancePct50OrBetter"
                    position="insideRight"
                    offset={8}
                    className="fill-primary-foreground font-bold"
                    fontSize={12}
                    formatter={(value: number) => `${Math.round(value * 100)}%`}
                  />
                </Bar>
                <Bar
                  dataKey="weightedAttendancePctLowerThan50"
                  fill="var(--color-weightedAttendancePctLowerThan50)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                  className="cursor-pointer"
                  onClick={(data: Raider) => handleBarClick(data)}
                >
                  <LabelList
                    dataKey="weightedAttendancePctLowerThan50"
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
