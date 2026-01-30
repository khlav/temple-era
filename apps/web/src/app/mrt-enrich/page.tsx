import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { MRTEnrichContent } from "~/components/mrt/mrt-enrich-content";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MRT Enrich - Temple Raids",
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
        MRT Composition Enrichment
      </div>
      <div className="mb-6 text-sm text-muted-foreground">
        Add server suffixes to player names in MRT raid compositions by matching
        against the database.
      </div>
      <MRTEnrichContent />
    </main>
  );
}
