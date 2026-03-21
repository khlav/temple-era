import React from "react";
import { type Metadata } from "next";
import { Separator } from "~/components/ui/separator";
import { RaidPlannerConfig } from "~/components/raid-planner/raid-planner-config";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Raid Plan Templates",
    description:
      "Configure reusable encounter templates for Temple raid plans.",
    path: "/raid-manager/raid-planner/config",
    noIndex: true,
  }),
};

export default async function RaidPlannerConfigPage() {
  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Raid Plan Templates
        <Separator className="my-2" />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">
        Configure encounter presets for each raid zone. Templates are copied to
        new raid plans on creation.
      </p>
      <RaidPlannerConfig />
    </main>
  );
}
