import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "~/server/auth";
import { type Metadata } from "next";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    nosnippet: true,
  },
};

export default async function RaidManagerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();

  if (!session?.user?.isRaidManager) {
    // [AGENT_NOTE]: This layout uses a hard-coded path and regex to detect raid plan IDs
    // because layouts do not receive route params for nested dynamic segments.
    // If the path `/raid-manager/raid-planner/` changes, this logic must be updated.
    const heads = await headers();
    const pathname = heads.get("x-pathname") ?? "";

    // Match /raid-manager/raid-planner/[uuid]
    // [AGENT_NOTE]: If the ID format changes from UUID, this regex will need updating.
    const planMatch = pathname.match(
      /\/raid-manager\/raid-planner\/([0-9a-f-]{36})/i,
    );

    if (planMatch?.[1]) {
      const planId = planMatch[1];
      let isPublic = false;
      try {
        const ctx = await createTRPCContext({ headers: heads });
        const caller = createCaller(ctx);
        const plan = await caller.raidPlan.getPublicById({ planId });
        if (plan) {
          isPublic = true;
        }
      } catch {
        // Plan is not public or doesn't exist — fall through to default redirect
      }

      if (isPublic) {
        redirect(`/raid-plans/${planMatch[1]}`);
      }
    }

    redirect("/");
  }

  return children;
}
