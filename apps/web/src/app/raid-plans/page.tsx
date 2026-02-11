import { type Metadata } from "next";
import { Suspense } from "react";
import { PublicRaidPlansList } from "~/components/raid-planner/public-raid-plans-list";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Recent Raid Plans",
  description: "Browse recent raid plans shared by raid managers",
};

function PublicRaidPlansListSkeleton() {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
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
      <Separator className="my-2" />
      <p className="mb-6 text-sm text-muted-foreground">
        Browse recent raid plans shared by raid managers.
      </p>
      <Suspense fallback={<PublicRaidPlansListSkeleton />}>
        <PublicRaidPlansList />
      </Suspense>
    </main>
  );
}
