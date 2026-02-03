import { type Metadata } from "next";
import { RaidPlanDetail } from "~/components/raid-planner/raid-plan-detail";

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

export default async function RaidPlanDetailPage({ params }: PageProps) {
  const { planId } = await params;

  return (
    <main className="w-full px-4">
      <RaidPlanDetail planId={planId} />
    </main>
  );
}
