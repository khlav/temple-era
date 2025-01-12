import React from "react";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { Separator } from "~/components/ui/separator";
import { auth } from "~/server/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Temple : Raid Attendance
      </div>
      <AttendanceDashboard />
    </main>
  );
}