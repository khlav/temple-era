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
      <div className="mb-2 text-3xl font-bold tracking-tight">SoftRes Scan</div>
      <div className="mb-4 text-sm text-muted-foreground">
        Checks characters and their soft reserves against attendance constraints
        and other rules + information.
      </div>
      <SoftResScanForm />
    </main>
  );
}
