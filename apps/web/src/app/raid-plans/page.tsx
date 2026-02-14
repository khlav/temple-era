import { type Metadata } from "next";
import { Suspense } from "react";
import { PublicPlansTable } from "~/components/raid-planner/public-plans-table";
import { Skeleton } from "~/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Recent Raid Plans",
  description: "Browse recent raid plans shared by raid managers",
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
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        Recent Raid Plans
      </div>
      <div className="mb-4 text-muted-foreground">
        Browse recent raid plans shared by raid managers.
      </div>
      <Suspense fallback={<PublicPlansTableSkeleton />}>
        <PublicPlansTable />
      </Suspense>
    </main>
  );
}
