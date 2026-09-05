import { type Metadata } from "next";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";
import { AchievementLog } from "~/components/achievements/achievement-log";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Achievement Log",
    description: "Every achievement earned across the guild, newest first.",
    path: "/achievements/log",
  }),
};

export default function AchievementLogPage() {
  return (
    <main className="w-full">
      <PageHeader eyebrow="Progress" title="Achievement Log" className="mb-4" />
      <AchievementLog />
    </main>
  );
}
