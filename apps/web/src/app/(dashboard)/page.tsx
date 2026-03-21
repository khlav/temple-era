import React from "react";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { env } from "~/env";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "WoW Classic Era - Raid Plans, Rosters, and Tools",
    description:
      "Raid attendance, raid planning, and guild tools for Temple on WoW Classic Era.",
    path: "/",
  }),
  verification: {
    google: env.GOOGLE_SITE_VERIFICATION,
  },
};

export default async function HomePage() {
  const session = await auth();
  return (
    <main className="w-full">
      <AttendanceDashboard currentUserSession={session ?? undefined} />
    </main>
  );
}
