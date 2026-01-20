import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { SoftResScanForm } from "~/components/softres/softres-scan-form";

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
    </main>
  );
}
