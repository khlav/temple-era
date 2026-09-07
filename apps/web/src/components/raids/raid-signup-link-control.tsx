"use client";

import { useState } from "react";
import { ExternalLinkIcon, Link2, RefreshCw, Repeat } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { summarizeSignupCounts } from "~/lib/raid-signup-status";

// No "zzz" — every time in this dialog is Eastern anyway (matches signup-history-table.tsx).
const COMPACT_DATETIME_FORMAT = "EEE, MMM d 'at' h:mm a";

const ZONE_QUALITY_LABEL: Record<string, string> = {
  exact_softres: "SoftRes match",
  exact_title_parse: "Title guess",
  unavailable: "No zone data",
  mismatch: "Zone name differs",
};

/**
 * Raid-manager-only control (gated by the caller on RAIDPLAN_MANAGE, same as the badge
 * this replaces) for viewing and correcting which Raid Helper signup a raid is linked
 * to. Auto-matching weighs timing far more than roster overlap (see
 * raid-signup-link-matching.ts), so it can confidently pick an occurrence whose
 * schedule lines up but whose actual signups don't — this is the human override for
 * exactly that case.
 */
export function RaidSignupLinkControl({
  raidId,
  trigger,
}: {
  raidId: number;
  /** Custom element to open the dialog — defaults to the "N(+M) signups" badge used in
   * the raid detail header. SignupVsRaidLogCard passes a small edit icon instead so the
   * same dialog is reachable from wherever a manager notices the link looks wrong. */
  trigger?: React.ReactNode;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);

  const utils = api.useUtils();
  const linkQuery = api.raidSignupLink.forRaid.useQuery({ raidId });
  // Only fetched once the dialog is opened — every raid detail page view otherwise pays
  // for a candidate scan nobody asked to see.
  const candidatesQuery = api.raidSignupLink.candidatesForRaid.useQuery(
    { raidId },
    { enabled: open },
  );

  const invalidate = () => {
    void utils.raidSignupLink.forRaid.invalidate({ raidId });
    void utils.raidSignupLink.candidatesForRaid.invalidate({ raidId });
    void utils.raidSignupLink.signupVsRaidLog.invalidate({ raidId });
  };

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
      toast({ title: "Link updated" });
      setPicking(false);
      invalidate();
    },
    onError: onError("update link"),
  });

  const link = linkQuery.data;

  const triggerLabel = (() => {
    if (linkQuery.isLoading) return "Signup link…";
    if (!link) return "No signup linked";
    if (!link.snapshot) return "Signup link (no data yet)";
    const { confirmed, bench } = summarizeSignupCounts(link.snapshot.signups);
    return `${confirmed}(+${bench}) signups`;
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPicking(false);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <Link2 className="h-3 w-3" />
            {triggerLabel}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signup link</DialogTitle>
          <DialogDescription>
            Which Raid Helper signup this raid&apos;s Signup Timeline and Signups ↔ Attendees tabs
            read from.
          </DialogDescription>
        </DialogHeader>

        {!picking ? (
          <div className="space-y-4">
            {link ? (
              <div className="space-y-1.5 rounded-lg border border-border/70 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium">
                    {link.eventUrl ? (
                      <a
                        href={link.eventUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-primary hover:underline"
                      >
                        {link.snapshot?.title ?? link.raidHelperEventId}
                        <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-text-top" />
                      </a>
                    ) : (
                      (link.snapshot?.title ?? link.raidHelperEventId)
                    )}
                  </span>
                  <Badge
                    variant={link.source === "manual" ? "default" : "secondary"}
                    className="shrink-0"
                  >
                    {link.source}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatEasternDateTime(new Date(link.startTime), COMPACT_DATETIME_FORMAT)}
                  {link.snapshot ? ` • ${link.snapshot.signUpCount} signed up` : ""}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{Math.round(link.confidence * 100)}% confidence</span>
                  <span>
                    {ZONE_QUALITY_LABEL[link.matchReason.zoneMatchQuality] ??
                      link.matchReason.zoneMatchQuality}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No Raid Helper signup is linked to this raid yet.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={rerunMutation.isPending}
                onClick={() => rerunMutation.mutate({ raidId })}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Re-run matching
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPicking(true)}>
                <Repeat className="h-3.5 w-3.5" />
                Change link…
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {candidatesQuery.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Loading candidates…</p>
            ) : (candidatesQuery.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No Raid Helper signups found near this raid&apos;s date.
              </p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {(candidatesQuery.data ?? []).map((candidate) => {
                  const isCurrent =
                    link?.raidHelperEventId === candidate.occurrence.raidHelperEventId &&
                    new Date(link.startTime).getTime() ===
                      new Date(candidate.occurrence.startTime).getTime();
                  return (
                    <div
                      key={`${candidate.occurrence.raidHelperEventId}:${candidate.occurrence.startTime}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-3 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {candidate.occurrence.title ?? candidate.occurrence.raidHelperEventId}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatEasternDateTime(
                            new Date(candidate.occurrence.startTime),
                            COMPACT_DATETIME_FORMAT,
                          )}{" "}
                          • {candidate.occurrence.signUpCount} signed up •{" "}
                          {Math.round(candidate.confidence * 100)}% match
                        </div>
                      </div>
                      {isCurrent ? (
                        <Badge variant="secondary" className="shrink-0">
                          Current
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0"
                          disabled={reassignMutation.isPending}
                          onClick={() =>
                            reassignMutation.mutate({
                              raidId,
                              raidHelperEventId: candidate.occurrence.raidHelperEventId,
                              startTime: candidate.occurrence.startTime,
                            })
                          }
                        >
                          Use this
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPicking(false)}>
                Back
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
