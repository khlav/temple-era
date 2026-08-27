import { type Metadata } from "next";
import { PageHeader } from "~/components/ui/page-header";
import { createPageMetadata } from "~/lib/site-metadata";
import { TrophyCase } from "~/components/achievements/trophy-case";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Trophy Case",
    description: "Your earned achievements, and a replay of every reveal you've ever seen.",
    path: "/trophies",
  }),
};

export default function TrophiesPage() {
  return (
    <main className="w-full max-w-3xl">
      <PageHeader
        eyebrow="Achievements"
        title="Trophy Case"
        description="Your standing achievements, and a replay button for any past reveal."
        className="mb-4"
      />
      <TrophyCase />
    </main>
  );
}
