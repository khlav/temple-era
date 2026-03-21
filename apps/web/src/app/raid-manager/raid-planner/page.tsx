import React from "react";
import Link from "next/link";
import { type Metadata } from "next";
import { Settings } from "lucide-react";
import { Separator } from "~/components/ui/separator";
import { Button } from "~/components/ui/button";
import { RaidPlannerStart } from "~/components/raid-planner/raid-planner-start";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Raid Planner",
    description: "Build and manage raid plans for upcoming Temple raids.",
    path: "/raid-manager/raid-planner",
    noIndex: true,
  }),
};

export default async function RaidPlannerPage() {
  return (
    <main className="w-full">
      <PageHeader
        title="Raid Planner"
        actions={
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="w-full sm:w-auto"
          >
            <Link href="/raid-manager/raid-planner/config">
              <Settings className="mr-1 h-4 w-4" />
              Manage Templates
            </Link>
          </Button>
        }
      />
      <Separator className="my-2" />
      <p className="mb-6 text-sm text-muted-foreground md:hidden">
        Desktop remains the best experience for heavy drag-and-drop editing.
      </p>
      <RaidPlannerStart />
    </main>
  );
}
