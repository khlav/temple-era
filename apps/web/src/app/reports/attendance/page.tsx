import { Suspense } from "react";
import { AttendanceReportClient } from "~/components/reports/attendance/attendance-report-client";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { headers } from "next/headers";
import { auth } from "~/server/auth";
import type { Metadata } from "next";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Attendance Report",
    description:
      "View detailed raid attendance reports with customizable filters and date ranges.",
    path: "/reports/attendance",
  }),
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
    <main className="w-full">
      <PageHeader title="Side-by-side attendance" className="mb-4" />

      <Suspense fallback={<div>Loading...</div>}>
        <AttendanceReportClient
          initialData={initialData}
          defaultCharacterId={session?.user?.characterId}
        />
      </Suspense>
    </main>
  );
}
