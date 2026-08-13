import { type Metadata } from "next";
import { Separator } from "~/components/ui/separator";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";
import { WorldBuffDashboard } from "~/components/world-buffs/world-buff-dashboard";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "World Buffs",
    description:
      "Track who's ready to drop Rend, Dragon, and ZG world buffs, submit your own availability, and schedule turn-ins.",
    path: "/world-buffs",
  }),
};

export default function WorldBuffsPage() {
  return (
    <main className="w-full">
      <PageHeader
        title="World Buffs"
        description="Submit which characters are ready to drop a world buff item, see who's available, and schedule turn-ins ahead of raid."
      />
      <Separator className="my-2" />
      <WorldBuffDashboard />
    </main>
  );
}
