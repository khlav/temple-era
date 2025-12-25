import { Suspense } from "react";
import { AttendanceReportClient } from "~/components/reports/attendance/attendance-report-client";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";
import { auth } from "~/server/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Raid Attendance Report | Temple Raids",
  description:
    "View detailed raid attendance reports with customizable filters and date ranges",
};

export default async function AttendanceReportPage() {
  const session = await auth();

  // Fetch initial data with defaults (6 weeks, default zones, no characters)
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);

  const initialData = await caller.reports.getAttendanceReportData({
    zones: ["naxxramas", "aq40", "mc", "bwl"],
  });

  return (
    <main className="w-full px-4">
      <div className="flex gap-4">
        <div className="grow-0 pb-4 text-3xl font-bold">
          Raid Attendance Report
        </div>
      </div>
      <p className="-mt-4 mb-4 text-muted-foreground">
        View and share detailed attendance reports. Select characters, adjust
        filters, and share the URL.
      </p>

      <Suspense fallback={<div>Loading...</div>}>
        <AttendanceReportClient
          initialData={initialData}
          defaultCharacterId={session?.user?.characterId}
        />
      </Suspense>
    </main>
  );
}
