import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { MRTEnrichContent } from "~/components/mrt/mrt-enrich-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fix MRT Comp Names - Temple Raids",
  description: "Enrich MRT raid composition strings with server suffixes",
};

export default async function MRTEnrichPage() {
  const session = await auth();

  // Check if user is raid manager
  if (!session?.user?.isRaidManager) {
    redirect("/");
  }

  return (
    <main className="w-full px-4">
      <div className="mb-2 text-3xl font-bold tracking-tight">
        MRT Raid Group Name Fix
      </div>
      <div className="mb-6 text-sm text-muted-foreground">
        Save time importing groups into MRT. Auto-lookup character-server names
        from raid logs.
      </div>
      <MRTEnrichContent />
    </main>
  );
}
