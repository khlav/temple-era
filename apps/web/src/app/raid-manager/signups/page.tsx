import { HydrateClient } from "~/trpc/server";
import { Separator } from "~/components/ui/separator";
import { SignupHistoryTable } from "~/components/raid-manager/signup-history-table";
import { type Metadata } from "next";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Link Signups <-> Raids",
    description: "Raid Helper signup events, matched to raids where possible.",
    path: "/raid-manager/signups",
    noIndex: true,
  }),
};

export default async function SignupHistoryPage() {
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="text-3xl font-bold tracking-tight">Link Signups &lt;-&gt; Raids</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every Raid Helper signup event, automatically matched to the completed raid its attendance
          was collected under where one exists. Upcoming events have no raid yet — click through to
          watch their signups. Use reassign to correct a wrong match, or rerun to retry matching.
        </p>
        <Separator className="my-4" />
        <SignupHistoryTable />
      </main>
    </HydrateClient>
  );
}
