import { type Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { PublicPlansTable } from "~/components/raid-planner/public-plans-table";
import { Skeleton } from "~/components/ui/skeleton";
import { Button } from "~/components/ui/button";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Raid Plans",
    description: "Browse recent raid plans shared by Temple raid managers.",
    path: "/raid-plans",
  }),
};

function PublicPlansTableSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

export default async function PublicRaidPlansPage() {
  const session = await auth();

  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Planning"
        title="Recent Raid Plans"
        className="mb-4"
        actions={
          session?.user?.isRaidManager ? (
            <Button variant="secondary" asChild className="w-full sm:w-auto">
              <Link href="/raid-manager/raid-planner">Manage plans</Link>
            </Button>
          ) : null
        }
      />
      <Suspense fallback={<PublicPlansTableSkeleton />}>
        <PublicPlansTable />
      </Suspense>
    </main>
  );
}
