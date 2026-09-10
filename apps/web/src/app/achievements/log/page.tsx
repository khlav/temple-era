import { type Metadata } from "next";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";
import { AchievementLog } from "~/components/achievements/achievement-log";
import { AchievementPopularity } from "~/components/achievements/achievement-popularity";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";

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
      {/* Popularity first — how rare things are is the more interesting default read on a guild-
          wide board; the chronological feed is one tab over for whoever wants that instead. */}
      <Tabs defaultValue="popularity">
        <TabsList>
          <TabsTrigger value="popularity">Popularity</TabsTrigger>
          <TabsTrigger value="log">Log</TabsTrigger>
        </TabsList>
        <TabsContent value="popularity">
          <AchievementPopularity />
        </TabsContent>
        <TabsContent value="log">
          <AchievementLog />
        </TabsContent>
      </Tabs>
    </main>
  );
}
