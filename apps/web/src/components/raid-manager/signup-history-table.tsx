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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { formatRaidDate, formatEasternDateTime } from "~/lib/raid-formatting";

const ZONE_QUALITY_LABEL: Record<string, string> = {
  exact_softres: "SoftRes match",
  exact_title_parse: "Title guess",
  unavailable: "No zone data",
  mismatch: "Zone name differs",
};

type MatchedLink = RouterOutputs["raidSignupLink"]["list"][number];
type ScheduledEvent = RouterOutputs["raidHelper"]["getScheduledEvents"][number];

type HistoryRow =
  | { kind: "matched"; startTime: number; link: MatchedLink }
  | { kind: "unmatched"; startTime: number; event: ScheduledEvent };

function signupTimelineHref(eventId: string, startTimeMs: number) {
  return `/raid-manager/signups/${eventId}?startTime=${encodeURIComponent(new Date(startTimeMs).toISOString())}`;
}

export function SignupHistoryTable() {
  const { toast } = useToast();
  const [reassignTarget, setReassignTarget] = useState<{ raidId: number; raidName: string } | null>(
    null,
  );
  const [reassignEventId, setReassignEventId] = useState("");
  const [reassignStartTime, setReassignStartTime] = useState("");
  const parsedReassignStartTime = useMemo(() => {
    if (!reassignStartTime.trim()) return null;
    const parsed = new Date(reassignStartTime.trim());
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }, [reassignStartTime]);

  const utils = api.useUtils();
  const listQuery = api.raidSignupLink.list.useQuery();
  const scheduledQuery = api.raidHelper.getScheduledEvents.useQuery({ allowableHoursPastStart: 1 });

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
      setReassignEventId("");
      setReassignStartTime("");
      invalidate();
    },
    onError: onError("reassign link"),
  });

  const rows = useMemo<HistoryRow[]>(() => {
    const links = listQuery.data ?? [];
    const matchedKeys = new Set(
      links.map((link) => `${link.raidHelperEventId}:${new Date(link.startTime).getTime()}`),
    );

    const matchedRows: HistoryRow[] = links.map((link) => ({
      kind: "matched",
      startTime: new Date(link.startTime).getTime(),
      link,
    }));

    const unmatchedRows: HistoryRow[] = (scheduledQuery.data ?? [])
      .filter((event) => !matchedKeys.has(`${event.id}:${event.startTime * 1000}`))
      .map((event) => ({ kind: "unmatched", startTime: event.startTime * 1000, event }));

    return [...matchedRows, ...unmatchedRows].sort((a, b) => b.startTime - a.startTime);
  }, [listQuery.data, scheduledQuery.data]);

  const isLoading = listQuery.isLoading || scheduledQuery.isLoading;

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
                        {formatEasternDateTime(new Date(row.link.startTime))}
                        {row.link.snapshot ? ` • ${row.link.snapshot.signUpCount} signed up` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/raids/${row.link.raidId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {row.link.raid.name}
                        <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-text-top" />
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatRaidDate(row.link.raid.date)} • {row.link.raid.zone}
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
                            setReassignTarget({
                              raidId: row.link.raidId,
                              raidName: row.link.raid.name,
                            })
                          }
                          title="Reassign to a different event"
                        >
                          <Repeat className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={`${row.event.id}:${row.startTime}`}>
                    <TableCell>
                      <Link
                        href={signupTimelineHref(row.event.id, row.startTime)}
                        className="font-medium hover:text-primary hover:underline"
                      >
                        {row.event.displayTitle || row.event.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {formatEasternDateTime(new Date(row.startTime))} • {row.event.signUpCount}{" "}
                        signed up
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
                      <Badge variant="outline">upcoming</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">—</span>
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
            <DialogTitle>Reassign {reassignTarget?.raidName}</DialogTitle>
            <DialogDescription>
              Manually point this raid at a different Raid Helper event occurrence. Replaces this
              raid's current link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="reassign-event-id">Raid Helper event ID</Label>
              <Input
                id="reassign-event-id"
                value={reassignEventId}
                onChange={(e) => setReassignEventId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reassign-start-time">Event start time (ISO)</Label>
              <Input
                id="reassign-start-time"
                placeholder="2026-01-20T20:00:00Z"
                value={reassignStartTime}
                onChange={(e) => setReassignStartTime(e.target.value)}
              />
              {reassignStartTime.trim() && !parsedReassignStartTime ? (
                <p className="text-xs text-destructive">Not a valid date/time.</p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignTarget(null)}>
              Cancel
            </Button>
            <Button
              disabled={
                !reassignTarget ||
                !reassignEventId.trim() ||
                !parsedReassignStartTime ||
                reassignMutation.isPending
              }
              onClick={() => {
                if (!reassignTarget || !parsedReassignStartTime) return;
                reassignMutation.mutate({
                  raidId: reassignTarget.raidId,
                  raidHelperEventId: reassignEventId.trim(),
                  startTime: parsedReassignStartTime,
                });
              }}
            >
              Reassign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
