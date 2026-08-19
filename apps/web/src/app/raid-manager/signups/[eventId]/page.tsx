import { type Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createCaller } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import { Separator } from "~/components/ui/separator";
import { SignupTimelineByOccurrence } from "~/components/raids/signup-timeline-tab";
import { formatEasternDateTime } from "~/lib/raid-formatting";

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

  const eventDetails = await caller.raidHelper.getEventDetails({ eventId }).catch(() => null);

  const title = eventDetails?.event.displayTitle || eventDetails?.event.title || eventId;

  return (
    <main className="w-full px-4">
      <Link
        href="/raid-manager/signups"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Signup History
      </Link>
      <h2 className="mt-2 text-3xl font-bold tracking-tight">{title}</h2>
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
