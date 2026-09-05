import { type Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { PageHeader } from "~/components/ui/page-header";
import { Button } from "~/components/ui/button";
import { createPageMetadata } from "~/lib/site-metadata";
import { AchievementCase } from "~/components/achievements/achievement-case";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "My Achievements",
    description: "Your earned achievements, and a replay of every reveal you've ever seen.",
    path: "/achievements",
  }),
};

export default async function AchievementsPage() {
  const session = await auth();
  return (
    <main className="w-full">
      <PageHeader
        eyebrow="Progress"
        title="My Achievements"
        className="mb-4"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/achievements/log">
              <ScrollText />
              Achievement Log
            </Link>
          </Button>
        }
      />
      <AchievementCase currentUserSession={session ?? undefined} />
    </main>
  );
}
