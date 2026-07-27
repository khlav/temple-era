import { type Metadata } from "next";
import { Suspense } from "react";
import { PublicPlansTable } from "~/components/raid-planner/public-plans-table";
import { Skeleton } from "~/components/ui/skeleton";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";

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
  return (
    <main className="w-full">
      <PageHeader title="Recent Raid Plans" className="mb-4" />
      <Suspense fallback={<PublicPlansTableSkeleton />}>
        <PublicPlansTable />
      </Suspense>
    </main>
  );
}
