import React from "react";
import Link from "next/link";
import { type Metadata } from "next";
import { Settings } from "lucide-react";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
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
      <div className="flex items-center justify-between">
        <div className="text-3xl font-bold tracking-tight">Raid Planner</div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/raid-manager/raid-planner/config">
            <Settings className="mr-1 h-4 w-4" />
            Manage Templates
          </Link>
        </Button>
      </div>
      <Separator className="my-2" />
      <p className="mb-6 text-sm text-muted-foreground">
        Plan groups and assignments before the raid.
      </p>
      <RaidPlannerStart />
    </main>
  );
}
