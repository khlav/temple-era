import { redirect } from "next/navigation";
import { type Metadata } from "next";
import { auth } from "~/server/auth";
import { SCOPE } from "~/lib/scopes";
import { createPageMetadata } from "~/lib/site-metadata";
import { AchievementAdminPanel } from "~/components/achievements/achievement-admin-panel";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Manage Achievements",
    description: "Create custom achievement awards and grant them to characters.",
    path: "/achievements/manage",
    noIndex: true,
  }),
};

// Deliberately its own route rather than under /admin/* — that layout gates on
// userpermissions:manage for the whole subtree, which would incorrectly block an officer who
// holds achievement:manage but not full admin access. See docs/ideation/achievement-engine
// spec-phase-1.md's Risks section.
export default async function ManageAchievementsPage() {
  const session = await auth();

  if (!session?.user?.scopes?.includes(SCOPE.ACHIEVEMENT_MANAGE)) {
    redirect("/");
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Manage Achievements</h1>
      <AchievementAdminPanel />
    </main>
  );
}
