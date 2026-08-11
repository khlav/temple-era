import { HydrateClient } from "~/trpc/server";
import { Separator } from "~/components/ui/separator";
import { SignupLinkReviewTable } from "~/components/raid-manager/signup-link-review-table";
import { type Metadata } from "next";
import { createPageMetadata } from "~/lib/site-metadata";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Signup Links",
    description: "Review and confirm raid-to-signup-event linkage.",
    path: "/raid-manager/signup-links",
    noIndex: true,
  }),
};

export default async function SignupLinksPage() {
  return (
    <HydrateClient>
      <main className="w-full px-4">
        <h2 className="text-3xl font-bold tracking-tight">Signup Links</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Completed raids matched to the Raid Helper signup event their attendance was collected
          under. Confirm or correct ambiguous matches below.
        </p>
        <Separator className="my-4" />
        <SignupLinkReviewTable />
      </main>
    </HydrateClient>
  );
}
