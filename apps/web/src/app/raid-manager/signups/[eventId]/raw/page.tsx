import { type Metadata } from "next";
import { getLatestSignupSnapshotForOccurrence } from "~/server/services/raid-helper-snapshot-queries";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

// Rough/draft raw-data view (TEMPLE-86 follow-up) — not a real UI, just enough to let a
// raid manager sanity-check what a signup-link row is actually pointing at. Calls the
// query service directly rather than going through tRPC since there's no client-side
// interactivity here worth the round trip.
export default async function RawSignupSnapshotPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ startTime?: string }>;
}) {
  const { eventId } = await params;
  const { startTime } = await searchParams;

  const parsedStartTime = startTime ? new Date(startTime) : null;
  const snapshot =
    parsedStartTime && !Number.isNaN(parsedStartTime.getTime())
      ? await getLatestSignupSnapshotForOccurrence(eventId, parsedStartTime)
      : undefined;

  return (
    <main className="w-full px-4">
      <h2 className="text-2xl font-bold tracking-tight">Raw signup snapshot</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Raid Helper event {eventId}. Rough/draft view — displays the latest captured snapshot as raw
        JSON.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-md border bg-card p-4 text-xs">
        {snapshot
          ? JSON.stringify(snapshot, null, 2)
          : "No snapshot found for this event/start time."}
      </pre>
    </main>
  );
}
