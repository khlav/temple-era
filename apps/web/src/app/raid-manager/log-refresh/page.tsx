import { HydrateClient } from "~/trpc/server";
import { RaidLogLoader } from "~/components/raids/raidlog-loader";
import { Separator } from "~/components/ui/separator";
import { type Metadata } from "next";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Refresh Raid Log",
    description:
      "Refresh a Warcraft Logs report without creating a new raid event.",
    path: "/raid-manager/log-refresh",
    noIndex: true,
  }),
};

export default async function RaidPage() {
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="text-3xl font-bold tracking-tight">
          Refresh WCL log (without creating a new raid event)
        </h2>
        <Separator className="my-2" />
        <div className="w-full">
          <RaidLogLoader label="Enter a WCL report URL to add/refresh the log and participating characters." />
        </div>
      </main>
    </HydrateClient>
  );
}
