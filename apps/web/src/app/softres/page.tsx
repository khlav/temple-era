import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { SoftResScanForm } from "~/components/softres/softres-scan-form";
import { Suspense } from "react";
import { DiscordSoftResLinks } from "~/components/softres/discord-softres-links";
import { Skeleton } from "~/components/ui/skeleton";

export default async function SoftResScanPage() {
  const session = await auth();

  // Check if user is raid manager
  if (!session?.user?.isRaidManager) {
    redirect("/");
  }

  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        [Beta] SoftRes Scan
      </div>
      <div className="mb-6 text-sm text-muted-foreground">
        Analyze soft reserves against attendance and raid requirements.
      </div>
      <SoftResScanForm />

      <Suspense
        fallback={
          <div className="mt-8">
            <Skeleton className="h-8 w-64" />
            <div className="mt-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        }
      >
        <DiscordSoftResLinks />
      </Suspense>
    </main>
  );
}
