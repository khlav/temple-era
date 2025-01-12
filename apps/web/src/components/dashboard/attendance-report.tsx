"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
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
  XAxis,
  YAxis,
} from "recharts";

interface Raider {
  name: string | null;
  characterId: number | null;
  weightedAttendance: number | null;
  weightedRaidTotal: number | null;
  weightedAttendancePct: number | null;
}

export function AttendanceReport() {
  const [countRaiders, setCountRaiders] = React.useState<number>(0);
  const [chartAttendenceData, setChartAttendenceData] = React.useState<
    Raider[]
  >([]);
  const { data: attendanceData, isSuccess } =
    api.dashboard.getPrimaryRaidAttendanceL6LockoutWk.useQuery();

  useEffect(() => {
    if (isSuccess) {
      const filteredAttendanceData = attendanceData.filter(
        (raider) => (raider.weightedAttendance ?? 0) >= 0.2,
      );

      const raiderData = filteredAttendanceData.map((raider) => {
        const raiderPct = raider.weightedAttendancePct ?? 0;
        return {
          ...raider,
          weightedAttendancePct50OrBetter: raiderPct >= 0.5 ? raiderPct : null,
          weightedAttendancePctLowerThan50: raiderPct >= 0.5 ? null : raiderPct,
        };
      });
      console.log(raiderData)
      setCountRaiders(raiderData.length);
      setChartAttendenceData(raiderData);
    }
  }, [attendanceData, setCountRaiders, isSuccess]);

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
      color: "hsl(var(--muted))",
    },
    label: {
      color: "#fff",
    },
  } satisfies ChartConfig;

  return (
    <Card>
      <CardHeader>
        Raiders with 20%+ Attendance : {countRaiders ?? ""}
      </CardHeader>
      <CardContent className="pt-4">
        {isSuccess ? (
          <div className="w-[100%]">
            <ChartContainer
              config={chartConfig}
              className="min-h-600 h-[1500px] w-[400px]"
            >
              <BarChart
                accessibilityLayer
                data={chartAttendenceData}
                layout="vertical"
                margin={{
                  left: 30,
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
                  // tickFormatter={(value) => value.slice(0, 3)}
                />
                <ChartTooltip
                  // formatter={chartTooltip}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                    />
                  }
                />
                <Bar
                  dataKey="weightedAttendancePct50OrBetter"
                  fill="var(--color-weightedAttendancePct50OrBetter)"
                  radius={4}
                  barSize={20}
                  stackId={1}
                >
                  <LabelList
                    dataKey="weightedAttendancePct50OrBetter"
                    position="insideRight"
                    offset={8}
                    className="fill-slate-900 font-bold"
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
                >
                  <LabelList
                    dataKey="weightedAttendancePctLowerThan50"
                    position="right"
                    offset={8}
                    className="secondary"
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
