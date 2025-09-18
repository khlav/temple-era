import React from "react";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { auth } from "~/server/auth";

export default async function HomePage() {
  const session = await auth();
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Temple : Raid Attendance
      </div>
      <AttendanceDashboard currentUserSession={session ?? undefined} />
    </main>
  );
}
