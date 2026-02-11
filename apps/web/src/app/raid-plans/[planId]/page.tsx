import { type Metadata } from "next";
import { headers } from "next/headers";
import { Suspense } from "react";
import { RaidPlanPublicView } from "~/components/raid-planner/raid-plan-public-view";
import { Skeleton } from "~/components/ui/skeleton";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

interface PageProps {
  params: Promise<{ planId: string }>;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { planId } = await params;

  try {
    const heads = new Headers(await headers());
    heads.set("x-trpc-source", "rsc");
    const ctx = await createTRPCContext({ headers: heads });
    const caller = createCaller(ctx);

    const plan = await caller.raidPlan.getPublicById({ planId });
    if (plan) {
      return {
        title: `${plan.name} - Raid Plan`,
        description: `View the raid plan for ${plan.name}`,
      };
    }
  } catch {
    // Plan may not exist or not be public
  }

  return {
    title: "Raid Plan",
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      nosnippet: true,
    },
  };
}

async function RaidPlanContent({ planId }: { planId: string }) {
  // Fetch plan name on server to avoid breadcrumb flash
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);

  let planName: string | undefined;
  try {
    const plan = await caller.raidPlan.getPublicById({ planId });
    planName = plan?.name;
  } catch {
    // Plan may not exist or user may not have access
  }

  return (
    <RaidPlanPublicView
      planId={planId}
      initialBreadcrumbData={planName ? { [planId]: planName } : undefined}
    />
  );
}

function RaidPlanSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Skeleton className="h-9 w-48" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    </div>
  );
}

export default async function RaidPlanPublicPage({ params }: PageProps) {
  const { planId } = await params;

  return (
    <main className="w-full px-4">
      <Suspense fallback={<RaidPlanSkeleton />}>
        <RaidPlanContent planId={planId} />
      </Suspense>
    </main>
  );
}
