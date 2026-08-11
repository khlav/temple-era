"use client";

import { useMemo, useState } from "react";
import { Check, RefreshCw, Repeat, X } from "lucide-react";
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
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { formatRaidDate, formatEasternDateTime } from "~/lib/raid-formatting";

type LinkStatus = "candidate" | "confirmed" | "rejected";
type StatusFilter = "all" | LinkStatus;

const STATUS_BADGE_VARIANT: Record<LinkStatus, "default" | "secondary" | "outline"> = {
  confirmed: "default",
  candidate: "secondary",
  rejected: "outline",
};

const ZONE_QUALITY_LABEL: Record<string, string> = {
  exact_softres: "SoftRes match",
  exact_title_parse: "Title guess",
  unavailable: "No zone data",
  mismatch: "Zone mismatch",
};

export function SignupLinkReviewTable() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("candidate");
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
  const listQuery = api.raidSignupLink.list.useQuery(
    statusFilter === "all" ? {} : { status: statusFilter },
  );

  const invalidate = () => void utils.raidSignupLink.list.invalidate();

  const onError = (action: string) => (error: { message: string }) =>
    toast({ title: `Failed to ${action}`, description: error.message, variant: "destructive" });

  const confirmMutation = api.raidSignupLink.confirm.useMutation({
    onSuccess: () => {
      toast({ title: "Link confirmed" });
      invalidate();
    },
    onError: onError("confirm link"),
  });
  const rejectMutation = api.raidSignupLink.reject.useMutation({
    onSuccess: () => {
      toast({ title: "Link rejected" });
      invalidate();
    },
    onError: onError("reject link"),
  });
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

  const links = useMemo(() => listQuery.data ?? [], [listQuery.data]);

  const filterButtons: Array<{ value: StatusFilter; label: string }> = [
    { value: "candidate", label: "Needs review" },
    { value: "confirmed", label: "Confirmed" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filterButtons.map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Raid</TableHead>
              <TableHead>Matched Occurrence</TableHead>
              <TableHead className="w-[110px]">Confidence</TableHead>
              <TableHead className="w-[130px]">Zone Match</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[220px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            ) : links.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No rows match this filter.
                </TableCell>
              </TableRow>
            ) : (
              links.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <div className="font-medium">{link.raid.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatRaidDate(link.raid.date)} • {link.raid.zone}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{link.snapshot?.title ?? link.raidHelperEventId}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatEasternDateTime(new Date(link.startTime))}
                      {link.snapshot ? ` • ${link.snapshot.signUpCount} signed up` : ""}
                    </div>
                  </TableCell>
                  <TableCell>{Math.round(link.confidence * 100)}%</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {ZONE_QUALITY_LABEL[link.matchReason.zoneMatchQuality] ??
                        link.matchReason.zoneMatchQuality}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[link.status]}>{link.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {link.status !== "confirmed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate({ linkId: link.id })}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      {link.status !== "rejected" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={rejectMutation.isPending}
                          onClick={() => rejectMutation.mutate({ linkId: link.id })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={rerunMutation.isPending}
                        onClick={() => rerunMutation.mutate({ raidId: link.raidId })}
                        title="Re-run matching"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setReassignTarget({ raidId: link.raidId, raidName: link.raid.name })
                        }
                        title="Reassign to a different event"
                      >
                        <Repeat className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
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
              Manually point this raid at a different Raid Helper event occurrence. Any existing
              link for this raid is superseded.
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
