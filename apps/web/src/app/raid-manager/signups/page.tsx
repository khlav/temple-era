import { HydrateClient } from "~/trpc/server";
import { Separator } from "~/components/ui/separator";
import { SignupHistoryTable } from "~/components/raid-manager/signup-history-table";
import { type Metadata } from "next";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Signup History",
    description: "Raids automatically matched to their Raid Helper signup event.",
    path: "/raid-manager/signups",
    noIndex: true,
  }),
};

export default async function SignupHistoryPage() {
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="text-3xl font-bold tracking-tight">Signup History</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Completed raids automatically matched to the Raid Helper signup event their attendance was
          collected under. Use reassign to correct a wrong match, or rerun to retry matching.
        </p>
        <Separator className="my-4" />
        <SignupHistoryTable />
      </main>
    </HydrateClient>
  );
}
