import { type Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { Separator } from "~/components/ui/separator";
import { SignupTimelineByOccurrence } from "~/components/raids/signup-timeline-tab";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { getLatestSignupSnapshotForOccurrence } from "~/server/services/raid-helper-snapshot-queries";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
};

export default async function SignupTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ startTime?: string }>;
}) {
  const { eventId } = await params;
  const { startTime: startTimeParam } = await searchParams;

  const startTime = startTimeParam ? new Date(startTimeParam) : null;
  if (!startTime || Number.isNaN(startTime.getTime())) {
    return (
      <main className="w-full px-4">
        <h2 className="text-2xl font-bold tracking-tight">Signup Timeline</h2>
        <p className="mt-1 text-sm text-destructive">
          Missing or invalid <code>startTime</code> query parameter — this page needs both the Raid
          Helper event ID and the occurrence&apos;s start time to look up its history.
        </p>
      </main>
    );
  }

  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  const ctx = await createTRPCContext({ headers: heads });
  const caller = createCaller(ctx);

  // The live Raid Helper API can 404 for an old occurrence (event expired/rotated —
  // TEMPLE-115's past-unmatched rows now surface signups up to 30 days back), so fall
  // back to our own captured snapshot's title before falling back to the raw event id.
  const [eventDetails, latestSnapshot] = await Promise.all([
    caller.raidHelper.getEventDetails({ eventId }).catch(() => null),
    getLatestSignupSnapshotForOccurrence(eventId, startTime).catch(() => undefined),
  ]);

  const title =
    eventDetails?.event.displayTitle ||
    eventDetails?.event.title ||
    latestSnapshot?.title ||
    eventId;

  return (
    <main className="w-full px-4">
      <Link
        href="/raid-manager/signups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Link Signups &lt;-&gt; Raids
      </Link>
      <h2 className="mt-2 flex flex-wrap items-baseline gap-2 text-3xl font-bold tracking-tight">
        <span>{title}</span>
        {title !== eventId ? (
          <span className="text-sm font-normal text-muted-foreground">{eventId}</span>
        ) : null}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatEasternDateTime(startTime)}
        {eventDetails ? ` • ${eventDetails.signups.total} signed up` : ""}
        {eventDetails?.event.leaderName ? ` • Posted by ${eventDetails.event.leaderName}` : ""}
      </p>
      <Separator className="my-4" />
      <SignupTimelineByOccurrence raidHelperEventId={eventId} startTime={startTime} />
    </main>
  );
}
