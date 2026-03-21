import React from "react";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { env } from "~/env";
import { PageHeader } from "~/components/ui/page-header";

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
    <main className="w-full">
      <PageHeader
        title="Temple : Raid Attendance"
        description="Guild attendance, upcoming raids, tracked lockouts, and quick access to Temple's operational tools."
        className="mb-4"
      />
      <AttendanceDashboard currentUserSession={session ?? undefined} />
    </main>
  );
}
