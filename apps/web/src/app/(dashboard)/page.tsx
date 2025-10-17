import React from "react";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { auth } from "~/server/auth";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Temple Raid Attendance - Home",
  description: "Track and manage raid attendance for the Temple guild",
  verification: {
    google: "KAWV6Xxbc8-t3O1I7suwjJxz1P7llEjgZW_zxo-EwUI",
  },
  alternates: {
    canonical: "/",
  },
};

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
