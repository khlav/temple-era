import React from "react";
import { type Metadata } from "next";
import { Separator } from "~/components/ui/separator";
import { RaidPlannerStart } from "~/components/raid-planner/raid-planner-start";

export const metadata: Metadata = {
  title: "Raid Planner",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function RaidPlannerPage() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Raid Planner
        <Separator className="my-2" />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Plan your raid composition and assignments before the raid.
      </p>
      <RaidPlannerStart />
    </main>
  );
}
