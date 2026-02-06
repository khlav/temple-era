import React from "react";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { env } from "~/env";

export const metadata: Metadata = {
  title: "Temple Raid Attendance - Home",
  description:
    "Attendence tracking and raid management for Temple, a horde guild on the World of Warcraft Classic Era cluster.",
  verification: {
    google: env.GOOGLE_SITE_VERIFICATION,
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
