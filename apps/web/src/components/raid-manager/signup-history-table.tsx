"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ExternalLinkIcon, RefreshCw, Repeat } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Label } from "~/components/ui/label";
import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { formatEasternDateTime, formatRaidDate } from "~/lib/raid-formatting";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";

// No "zzz" — the Raid/RaidHelper Signup columns are dense enough without the timezone
// abbreviation; every time on this page is Eastern anyway.
const COMPACT_DATETIME_FORMAT = "EEE, MMM d 'at' h:mm a";

const ZONE_QUALITY_LABEL: Record<string, string> = {
  exact_softres: "SoftRes match",
  exact_title_parse: "Title guess",
  unavailable: "No zone data",
  mismatch: "Zone name differs",
};

type MatchedLink = RouterOutputs["raidSignupLink"]["list"][number];

// An unmatched occurrence's fields, regardless of which source produced it — see the two
// mapping sites in `rows` below.
type UnmatchedOccurrence = {
  raidHelperEventId: string;
  startTime: number;
  title: string;
  signUpCount: number;
};

type HistoryRow =
  | { kind: "matched"; startTime: number; link: MatchedLink }
  | { kind: "unmatched"; startTime: number; occurrence: UnmatchedOccurrence };

function signupTimelineHref(eventId: string, startTimeMs: number) {
  return `/raid-manager/signups/${eventId}?startTime=${encodeURIComponent(new Date(startTimeMs).toISOString())}`;
}

// A raid's WCL log is usually imported within a few days, but shouldn't vanish from this
// list just because it took longer — 30 days covers that lag without pulling in Raid
// Helper's full, unbounded event history (TEMPLE-115).
const UNMATCHED_LOOKBACK_HOURS = 24 * 30;

// Duplicates across sources (two Raid Helper postings for the same slot, or a captured
// snapshot vs. the live list drifting a few minutes apart) are collapsed if they land
// within this tolerance of each other, rather than requiring exact equality (TEMPLE-115).
const DUPLICATE_TOLERANCE_MS = 15 * 60 * 1000;

export function SignupHistoryTable() {
  const { toast } = useToast();
  const [reassignTarget, setReassignTarget] = useState<{
    raidHelperEventId: string;
    startTime: number;
    title: string;
  } | null>(null);
  const [reassignRaidId, setReassignRaidId] = useState<string | null>(null);

  const utils = api.useUtils();
  const listQuery = api.raidSignupLink.list.useQuery();
  const raidsQuery = api.raid.getRaids.useQuery();
  // Only genuinely upcoming/just-started events need the live Raid Helper list — past,
  // still-unmatched occurrences come from `unmatchedPastOccurrences` instead (our own
  // captured snapshots), same convention as the dashboard's upcoming-events widget.
  const scheduledQuery = api.raidHelper.getScheduledEvents.useQuery({ allowableHoursPastStart: 2 });
  const pastSnapshotsQuery = api.raidSignupLink.unmatchedPastOccurrences.useQuery({
    startTimeFrom: new Date(Date.now() - UNMATCHED_LOOKBACK_HOURS * 60 * 60 * 1000),
  });

  const invalidate = () => void utils.raidSignupLink.list.invalidate();

  const onError = (action: string) => (error: { message: string }) =>
    toast({ title: `Failed to ${action}`, description: error.message, variant: "destructive" });

  const rerunMutation = api.raidSignupLink.rerun.useMutation({
    onSuccess: (data) => {
      toast({ title: "Matching re-run", description: `Outcome: ${data.outcome}` });
      invalidate();
    },
    onError: onError("re-run matching"),
  });
  const reassignMutation = api.raidSignupLink.reassign.useMutation({
    onSuccess: () => {
      toast({ title: "Link reassigned" });
      setReassignTarget(null);
      setReassignRaidId(null);
      invalidate();
    },
    onError: onError("reassign link"),
  });

  const matchedEventIds = useMemo(
    () => new Set((listQuery.data ?? []).map((link) => link.raidHelperEventId)),
    [listQuery.data],
  );
  const matchedStartTimes = useMemo(
    () => (listQuery.data ?? []).map((link) => new Date(link.startTime).getTime()),
    [listQuery.data],
  );

  const raidOptions = useMemo(
    () => (raidsQuery.data ?? []).map((r) => ({ value: String(r.raidId), raid: r })),
    [raidsQuery.data],
  );

  const rows = useMemo<HistoryRow[]>(() => {
    const links = listQuery.data ?? [];

    const matchedRows: HistoryRow[] = links.map((link) => ({
      kind: "matched",
      startTime: new Date(link.startTime).getTime(),
      link,
    }));

    // Snapshot-sourced (past) candidates are listed first so they win a same-slot
    // collision against the live list — they're the ground truth the auto-matcher
    // itself trusts, whereas the live list can carry drift/duplicate postings.
    const candidates: UnmatchedOccurrence[] = [
      ...(pastSnapshotsQuery.data ?? []).map((s) => ({
        raidHelperEventId: s.raidHelperEventId,
        startTime: new Date(s.startTime).getTime(),
        title: s.title ?? s.raidHelperEventId,
        signUpCount: s.signUpCount,
      })),
      ...(scheduledQuery.data ?? []).map((event) => ({
        raidHelperEventId: event.id,
        startTime: event.startTime * 1000,
        title: event.displayTitle || event.title,
        signUpCount: event.signUpCount,
      })),
    ];

    const accepted: UnmatchedOccurrence[] = [];
    for (const candidate of candidates) {
      const isMatched =
        matchedEventIds.has(candidate.raidHelperEventId) ||
        matchedStartTimes.some((t) => Math.abs(t - candidate.startTime) <= DUPLICATE_TOLERANCE_MS);
      if (isMatched) continue;

      const isDuplicate = accepted.some(
        (a) =>
          a.raidHelperEventId === candidate.raidHelperEventId ||
          Math.abs(a.startTime - candidate.startTime) <= DUPLICATE_TOLERANCE_MS,
      );
      if (!isDuplicate) accepted.push(candidate);
    }

    const unmatchedRows: HistoryRow[] = accepted.map((occurrence) => ({
      kind: "unmatched",
      startTime: occurrence.startTime,
      occurrence,
    }));

    return [...matchedRows, ...unmatchedRows].sort((a, b) => b.startTime - a.startTime);
  }, [
    listQuery.data,
    scheduledQuery.data,
    pastSnapshotsQuery.data,
    matchedEventIds,
    matchedStartTimes,
  ]);

  const isLoading = listQuery.isLoading || scheduledQuery.isLoading || pastSnapshotsQuery.isLoading;

  const openReassignDialog = (target: {
    raidHelperEventId: string;
    startTime: number;
    title: string;
    currentRaidId?: number;
  }) => {
    setReassignRaidId(target.currentRaidId ? String(target.currentRaidId) : null);
    setReassignTarget(target);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>RaidHelper Signup</TableHead>
              <TableHead>Raid</TableHead>
              <TableHead className="w-[110px]">Confidence</TableHead>
              <TableHead className="w-[140px]">Zone Match</TableHead>
              <TableHead className="w-[90px]">Source</TableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No signup events found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) =>
                row.kind === "matched" ? (
                  <TableRow key={row.link.id}>
                    <TableCell>
                      <Link
                        href={signupTimelineHref(row.link.raidHelperEventId, row.startTime)}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {row.link.snapshot?.title ?? row.link.raidHelperEventId}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatEasternDateTime(
                          new Date(row.link.startTime),
                          COMPACT_DATETIME_FORMAT,
                        )}
                        {row.link.snapshot ? ` • ${row.link.snapshot.signUpCount} signed up` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          href={`/raids/${row.link.raidId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate font-medium hover:text-primary hover:underline"
                        >
                          {row.link.raid.name}
                          <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-text-top" />
                        </Link>
                        <ZoneBadge zoneName={row.link.raid.zone} />
                        <RaidAttendenceWeightBadge
                          attendanceWeight={row.link.raid.attendanceWeight}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatEasternDateTime(new Date(row.startTime), COMPACT_DATETIME_FORMAT)}
                      </div>
                    </TableCell>
                    <TableCell>{Math.round(row.link.confidence * 100)}%</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {ZONE_QUALITY_LABEL[row.link.matchReason.zoneMatchQuality] ??
                          row.link.matchReason.zoneMatchQuality}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.link.source === "manual" ? "default" : "secondary"}>
                        {row.link.source}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rerunMutation.isPending}
                          onClick={() => rerunMutation.mutate({ raidId: row.link.raidId })}
                          title="Re-run matching"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openReassignDialog({
                              raidHelperEventId: row.link.raidHelperEventId,
                              startTime: row.startTime,
                              title: row.link.snapshot?.title ?? row.link.raidHelperEventId,
                              currentRaidId: row.link.raidId,
                            })
                          }
                          title="Link to a different raid"
                        >
                          <Repeat className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={`${row.occurrence.raidHelperEventId}:${row.startTime}`}>
                    <TableCell>
                      <Link
                        href={signupTimelineHref(row.occurrence.raidHelperEventId, row.startTime)}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {row.occurrence.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatEasternDateTime(new Date(row.startTime), COMPACT_DATETIME_FORMAT)} •{" "}
                        {row.occurrence.signUpCount} signed up
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs italic text-muted-foreground">
                        Not linked - no raid log for this event yet
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">—</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {row.startTime > Date.now() ? "upcoming" : "no log yet"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          openReassignDialog({
                            raidHelperEventId: row.occurrence.raidHelperEventId,
                            startTime: row.startTime,
                            title: row.occurrence.title,
                          })
                        }
                        title="Link to a raid"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={reassignTarget !== null}
        onOpenChange={(open) => !open && setReassignTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link &quot;{reassignTarget?.title}&quot; to a raid</DialogTitle>
            <DialogDescription>
              Point this Raid Helper signup at a specific raid. Replaces that raid&apos;s current
              signup link, if any.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reassign-raid">Raid</Label>
            <Select value={reassignRaidId ?? undefined} onValueChange={setReassignRaidId}>
              <SelectTrigger id="reassign-raid">
                <SelectValue placeholder="Select a raid…" />
              </SelectTrigger>
              <SelectContent>
                {raidOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <span className="flex items-center gap-2">
                      <span className="truncate">{option.raid.name}</span>
                      <ZoneBadge zoneName={option.raid.zone} />
                      <RaidAttendenceWeightBadge attendanceWeight={option.raid.attendanceWeight} />
                      <span className="shrink-0 text-muted-foreground">
                        - {formatRaidDate(option.raid.date)}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={!reassignTarget || !reassignRaidId || reassignMutation.isPending}
              onClick={() => {
                if (!reassignTarget || !reassignRaidId) return;
                reassignMutation.mutate({
                  raidId: Number(reassignRaidId),
                  raidHelperEventId: reassignTarget.raidHelperEventId,
                  startTime: new Date(reassignTarget.startTime),
                });
              }}
            >
              Link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
