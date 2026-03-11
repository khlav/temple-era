import { type Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { RaidPlanDetail } from "~/components/raid-planner/raid-plan-detail";
import { Skeleton } from "~/components/ui/skeleton";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export const metadata: Metadata = {
  title: "Raid Plan",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

interface PageProps {
  params: Promise<{ planId: string }>;
}

async function RaidPlanContent({ planId }: { planId: string }) {
  // Fetch plan name on server to avoid breadcrumb flash
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);

  let planName: string | undefined;
  let shouldRedirectToPublic = false;
  try {
    const plan = await caller.raidPlan.getById({ planId });
    planName = plan?.name;
  } catch {
    // User does not have raid manager access — check if a public view exists (fallback for layout redirect)
    try {
      const publicPlan = await caller.raidPlan.getPublicById({ planId });
      if (publicPlan) {
        shouldRedirectToPublic = true;
      }
    } catch {
      // Plan is not public either; fall through and let the planner handle it
    }
  }

  if (shouldRedirectToPublic) {
    // [AGENT_NOTE]: This is a fallback redirect that mirrors the logic in the raid-manager layout.
    // It depends on the public view route being `/raid-plans/[planId]`.
    redirect(`/raid-plans/${planId}`);
  }

  return (
    <RaidPlanDetail
      planId={planId}
      initialBreadcrumbData={planName ? { [planId]: planName } : undefined}
    />
  );
}

function RaidPlanSkeleton() {
  return (
    <div className="">
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

export default async function RaidPlanDetailPage({ params }: PageProps) {
  const { planId } = await params;

  return (
    <main className="w-full px-4">
      <Suspense fallback={<RaidPlanSkeleton />}>
        <RaidPlanContent planId={planId} />
      </Suspense>
    </main>
  );
}
