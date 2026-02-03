"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Calendar,
  Check,
  Copy,
  HelpCircle,
  Link2,
  Loader2,
  AlertTriangle,
  MinusCircle,
} from "lucide-react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { MRTCodec } from "~/lib/mrt-codec";
import { useToast } from "~/hooks/use-toast";

export function RaidPlannerImport() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);

  const {
    data: events,
    isLoading,
    error,
  } = api.raidHelper.getScheduledEvents.useQuery();

  // Fetch existing plans for all events
  const eventIds = events?.map((e) => e.id) ?? [];
  const { data: existingPlans } =
    api.raidPlan.getExistingPlansForEvents.useQuery(
      { raidHelperEventIds: eventIds },
      { enabled: eventIds.length > 0 },
    );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Scheduled Raids */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Calendar className="h-5 w-5" />
          Scheduled Raids
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-red-500">
            Failed to load events: {error.message}
          </div>
        ) : !events || events.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No scheduled events found.
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                isSelected={selectedEventId === event.id}
                existingPlanId={existingPlans?.[event.id]}
                onSelect={() =>
                  setSelectedEventId(
                    selectedEventId === event.id ? null : event.id,
                  )
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: URL Input */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <Link2 className="h-5 w-5" />
          Import from URL
        </h3>
        <UrlImportForm
          url={url}
          setUrl={setUrl}
          error={urlError}
          setError={setUrlError}
          onEventSelect={setSelectedEventId}
        />
      </div>

      {/* Character Matching Dialog */}
      <CharacterMatchingDialog
        eventId={selectedEventId}
        open={!!selectedEventId}
        onOpenChange={(open) => !open && setSelectedEventId(null)}
      />
    </div>
  );
}

interface EventRowProps {
  event: {
    id: string;
    title: string;
    displayTitle?: string;
    channelName: string;
    startTime: number;
    leaderName: string;
  };
  isSelected: boolean;
  existingPlanId?: string;
  onSelect: () => void;
}

function EventRow({
  event,
  isSelected,
  existingPlanId,
  onSelect,
}: EventRowProps) {
  const formattedDate = new Date(event.startTime * 1000).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
    },
  );

  const formattedTime = new Date(event.startTime * 1000).toLocaleTimeString(
    "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    },
  );

  const hasPlan = !!existingPlanId;

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-lg border p-3",
        "transition-colors hover:border-primary hover:bg-accent",
        isSelected && "border-primary bg-accent",
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="font-medium">{event.displayTitle ?? event.title}</div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{formattedDate}</span>
          <span>{formattedTime}</span>
          <span>{event.leaderName}</span>
        </div>
      </div>
      <div>
        {hasPlan ? (
          <Button variant="outline" size="sm" asChild>
            <a href={`/raid-manager/raid-planner/${existingPlanId}`}>
              View Plan
            </a>
          </Button>
        ) : (
          <Button variant="default" size="sm" onClick={onSelect}>
            Create Plan
          </Button>
        )}
      </div>
    </div>
  );
}

interface CharacterMatchingDialogProps {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CharacterMatchingDialog({
  eventId,
  open,
  onOpenChange,
}: CharacterMatchingDialogProps) {
  const router = useRouter();
  const { toast } = useToast();

  const { data: eventDetails, isLoading: isLoadingDetails } =
    api.raidHelper.getEventDetails.useQuery(
      { eventId: eventId! },
      { enabled: !!eventId && open },
    );

  // Prepare signups for matching
  const signupsForMatching = useMemo(() => {
    if (!eventDetails) return [];
    const allSignups = [
      ...eventDetails.signups.assigned,
      ...eventDetails.signups.unassigned,
    ];
    return allSignups.map((s) => ({
      userId: s.userId,
      discordName: s.name,
      className: s.className,
      specName: s.specName,
      partyId: s.partyId,
      slotId: s.slotId,
    }));
  }, [eventDetails]);

  const { data: matchResults, isLoading: isLoadingMatches } =
    api.raidHelper.matchSignupsToCharacters.useQuery(
      { signups: signupsForMatching },
      { enabled: signupsForMatching.length > 0 },
    );

  // Compute match stats
  const matchStats = useMemo(() => {
    if (!matchResults) return null;

    const matched = matchResults.filter((r) => r.status === "matched");
    const ambiguous = matchResults.filter((r) => r.status === "ambiguous");
    const unmatched = matchResults.filter((r) => r.status === "unmatched");
    const skipped = matchResults.filter((r) => r.status === "skipped");

    // Group ALL results by partyId
    const byParty = new Map<number | null, typeof matchResults>();
    for (const r of matchResults) {
      const partyId = r.partyId;
      if (!byParty.has(partyId)) {
        byParty.set(partyId, []);
      }
      byParty.get(partyId)!.push(r);
    }

    return {
      matched,
      ambiguous,
      unmatched,
      skipped,
      byParty,
      total: matchResults.length,
    };
  }, [matchResults]);

  // Detect zone from event title
  const detectedZone = useMemo(() => {
    const rawTitle =
      eventDetails?.event.displayTitle || eventDetails?.event.title;
    if (!rawTitle) return null;
    const title = rawTitle.toLowerCase();

    // Check for zone abbreviations and names
    const zonePatterns: Array<{ pattern: RegExp; zoneId: string }> = [
      { pattern: /\bbwl\b|blackwing/i, zoneId: "bwl" },
      { pattern: /\bmc\b|molten\s*core/i, zoneId: "mc" },
      { pattern: /\bnaxx?\b|naxxramas/i, zoneId: "naxxramas" },
      { pattern: /\bony\b|onyxia/i, zoneId: "onyxia" },
      { pattern: /\baq20\b|ruins/i, zoneId: "aq20" },
      { pattern: /\baq40\b|temple\s*of\s*ahn/i, zoneId: "aq40" },
      { pattern: /\bzg\b|zul.?gurub/i, zoneId: "zg" },
    ];

    for (const { pattern, zoneId } of zonePatterns) {
      if (pattern.test(title)) {
        return zoneId;
      }
    }
    return null;
  }, [eventDetails?.event.displayTitle, eventDetails?.event.title]);

  const [copied, setCopied] = useState(false);

  const createPlanMutation = api.raidPlan.create.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Plan created",
        description: "Redirecting to plan details...",
      });
      onOpenChange(false);
      router.push(`/raid-manager/raid-planner/${data.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreatePlan = useCallback(() => {
    if (!eventId || !eventDetails || !matchResults || !detectedZone) return;

    // Build characters array from match results (excluding skipped)
    const characters = matchResults
      .filter((r) => r.status !== "skipped")
      .map((r) => {
        // Convert partyId/slotId from 1-indexed to 0-indexed
        const defaultGroup =
          r.partyId !== null && r.partyId <= 8 ? r.partyId - 1 : null;
        const defaultPosition = r.slotId !== null ? r.slotId - 1 : null;

        // Use matched character name if available, otherwise use discord name
        const characterName =
          r.status === "matched" && r.matchedCharacter
            ? r.matchedCharacter.characterName
            : r.discordName;

        const characterId =
          r.status === "matched" && r.matchedCharacter
            ? r.matchedCharacter.characterId
            : null;

        return {
          characterId,
          characterName,
          defaultGroup,
          defaultPosition,
        };
      });

    createPlanMutation.mutate({
      raidHelperEventId: eventId,
      name: eventDetails.event.displayTitle || eventDetails.event.title,
      zoneId: detectedZone,
      characters,
    });
  }, [eventId, eventDetails, matchResults, detectedZone, createPlanMutation]);

  const handleCopyMRT = useCallback(() => {
    if (!matchResults) return;

    // Build MRT raid data: position (1-40) -> "CharacterName-Server" or discord name
    const raidData: Record<number, string> = {};
    const slotsPerParty = eventDetails?.plan?.slotPerParty ?? 5;

    for (const result of matchResults) {
      // Skip unassigned (null partyId/slotId) or groups beyond 8
      if (result.partyId === null || result.slotId === null) continue;
      if (result.partyId > 8) continue;

      // Calculate position: (partyId - 1) * slotsPerParty + slotId
      // Both partyId and slotId are 1-indexed from Raid-Helper
      const position = (result.partyId - 1) * slotsPerParty + result.slotId;

      // Get the name to use
      let name: string;
      if (result.status === "matched" && result.matchedCharacter) {
        name = result.matchedCharacter.characterName;
        if (result.matchedCharacter.characterServer) {
          name += `-${result.matchedCharacter.characterServer}`;
        }
      } else {
        // For ambiguous, unmatched, or skipped - wrap discord name with class,spec
        const spec = result.specName ? `,${result.specName}` : "";
        name = `--${result.discordName} (${result.className}${spec})--`;
      }

      raidData[position] = name;
    }

    // Encode using MRT codec
    const codec = new MRTCodec();
    const mrtString = codec.encode(raidData);

    // Copy to clipboard
    void navigator.clipboard.writeText(mrtString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [matchResults, eventDetails?.plan?.slotPerParty]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {eventDetails?.event.displayTitle ??
              eventDetails?.event.title ??
              "Character Matching"}
          </DialogTitle>
        </DialogHeader>

        {isLoadingDetails ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading event details...
          </div>
        ) : eventDetails ? (
          <div className="space-y-4">
            {isLoadingMatches ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Matching characters...
              </div>
            ) : matchStats ? (
              <div className="space-y-3">
                {/* Stats row */}
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <Check className="h-4 w-4" />
                    {matchStats.matched.length} matched
                  </span>
                  {matchStats.ambiguous.length > 0 && (
                    <span className="flex items-center gap-1 text-yellow-600">
                      <AlertTriangle className="h-4 w-4" />
                      {matchStats.ambiguous.length} ambiguous
                    </span>
                  )}
                  {matchStats.unmatched.length > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <HelpCircle className="h-4 w-4" />
                      {matchStats.unmatched.length} unmatched
                    </span>
                  )}
                  {matchStats.skipped.length > 0 && (
                    <span className="flex items-center gap-1 text-muted-foreground/60">
                      <MinusCircle className="h-4 w-4" />
                      {matchStats.skipped.length} skipped
                    </span>
                  )}
                </div>

                {/* All characters grouped by party */}
                <div className="rounded border bg-muted/30 p-3">
                  <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from(matchStats.byParty.entries())
                      .filter(([partyId]) => partyId !== null)
                      .sort(([a], [b]) => (a ?? 999) - (b ?? 999))
                      .map(([partyId, members]) => (
                        <div key={partyId ?? "unassigned"}>
                          <div className="mb-1 font-medium">
                            {eventDetails?.plan?.partyNames?.[partyId! - 1] ??
                              `Group ${partyId}`}
                          </div>
                          <ul className="ml-1 space-y-0.5">
                            {members
                              .sort(
                                (a, b) => (a.slotId ?? 999) - (b.slotId ?? 999),
                              )
                              .map((m) => (
                                <li
                                  key={m.userId}
                                  className="flex items-center gap-1.5"
                                >
                                  {m.status === "matched" && (
                                    <>
                                      <Check className="h-3 w-3 shrink-0 text-green-600" />
                                      <span className="text-muted-foreground">
                                        {m.discordName}
                                      </span>
                                      <span className="text-muted-foreground">
                                        →
                                      </span>
                                      <span className="font-medium">
                                        {m.matchedCharacter?.characterName}
                                        {m.matchedCharacter?.characterServer &&
                                          `-${m.matchedCharacter.characterServer}`}
                                      </span>
                                    </>
                                  )}
                                  {m.status === "ambiguous" && (
                                    <>
                                      <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-600" />
                                      <span className="text-muted-foreground">
                                        {m.discordName}
                                      </span>
                                      <span className="text-muted-foreground">
                                        →
                                      </span>
                                      <span className="text-yellow-600">
                                        {m.candidates
                                          ?.map(
                                            (c) =>
                                              `${c.characterName}${c.characterServer ? `-${c.characterServer}` : ""}`,
                                          )
                                          .join(", ")}
                                      </span>
                                    </>
                                  )}
                                  {m.status === "unmatched" && (
                                    <>
                                      <HelpCircle className="h-3 w-3 shrink-0 text-muted-foreground" />
                                      <span className="text-muted-foreground">
                                        {m.discordName} ({m.className})
                                      </span>
                                    </>
                                  )}
                                  {m.status === "skipped" && (
                                    <>
                                      <MinusCircle className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                      <span className="text-muted-foreground/60">
                                        {m.discordName} ({m.className})
                                      </span>
                                    </>
                                  )}
                                </li>
                              ))}
                          </ul>
                        </div>
                      ))}
                  </div>

                  {/* Unassigned section */}
                  {matchStats.byParty.has(null) && (
                    <div className="mt-4 border-t pt-3">
                      <div className="mb-1 text-xs font-medium text-muted-foreground">
                        Unassigned
                      </div>
                      <ul className="ml-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        {matchStats.byParty.get(null)!.map((m) => (
                          <li
                            key={m.userId}
                            className="flex items-center gap-1.5"
                          >
                            {m.status === "matched" && (
                              <>
                                <Check className="h-3 w-3 shrink-0 text-green-600" />
                                <span className="text-muted-foreground">
                                  {m.discordName}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium">
                                  {m.matchedCharacter?.characterName}
                                  {m.matchedCharacter?.characterServer &&
                                    `-${m.matchedCharacter.characterServer}`}
                                </span>
                              </>
                            )}
                            {m.status === "ambiguous" && (
                              <>
                                <AlertTriangle className="h-3 w-3 shrink-0 text-yellow-600" />
                                <span className="text-muted-foreground">
                                  {m.discordName}
                                </span>
                                <span className="text-muted-foreground">→</span>
                                <span className="text-yellow-600">
                                  {m.candidates
                                    ?.map(
                                      (c) =>
                                        `${c.characterName}${c.characterServer ? `-${c.characterServer}` : ""}`,
                                    )
                                    .join(", ")}
                                </span>
                              </>
                            )}
                            {m.status === "unmatched" && (
                              <>
                                <HelpCircle className="h-3 w-3 shrink-0 text-muted-foreground" />
                                <span className="text-muted-foreground">
                                  {m.discordName} ({m.className})
                                </span>
                              </>
                            )}
                            {m.status === "skipped" && (
                              <>
                                <MinusCircle className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                                <span className="text-muted-foreground/60">
                                  {m.discordName} ({m.className})
                                </span>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No signups to match
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-red-500">
            Failed to load event details
          </div>
        )}

        {matchStats && (
          <DialogFooter>
            <Button onClick={handleCopyMRT} variant="outline">
              <Copy className="mr-2 h-4 w-4" />
              {copied ? "Copied!" : "Copy MRT Export"}
            </Button>
            <Button
              onClick={handleCreatePlan}
              disabled={!detectedZone || createPlanMutation.isPending}
              title={
                !detectedZone
                  ? "Could not detect zone from event title"
                  : undefined
              }
            >
              {createPlanMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Plan"
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface UrlImportFormProps {
  url: string;
  setUrl: (url: string) => void;
  error: string | null;
  setError: (error: string | null) => void;
  onEventSelect: (eventId: string) => void;
}

function UrlImportForm({
  url,
  setUrl,
  error,
  setError,
  onEventSelect,
}: UrlImportFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const utils = api.useUtils();

  const extractEventId = (urlStr: string): string | null => {
    // Match patterns like:
    // https://raid-helper.dev/raidplan/1234567890
    // https://raid-helper.dev/event/1234567890
    // raid-helper.dev/raidplan/1234567890
    const match = urlStr.match(/raid-helper\.dev\/(?:raidplan|event)\/(\d+)/);
    return match?.[1] ?? null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!url.trim()) {
      setError("Please enter a Raid-Helper URL");
      return;
    }

    const eventId = extractEventId(url);
    if (!eventId) {
      setError(
        "Invalid URL. Expected: raid-helper.dev/raidplan/{id} or raid-helper.dev/event/{id}",
      );
      return;
    }

    setIsLoading(true);
    try {
      // Validate the event exists
      await utils.raidHelper.getEventDetails.fetch({ eventId });
      // Open the dialog with the validated event
      onEventSelect(eventId);
    } catch (err) {
      setError("Failed to fetch event. Please check the URL and try again.");
      console.error("Failed to import:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            id="raid-helper-url"
            type="url"
            placeholder="https://raid-helper.dev/raidplan/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={error ? "border-red-500" : ""}
            autoComplete="off"
          />
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Import"
            )}
          </Button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Paste a raid-helper.dev/raidplan or raid-helper.dev/event URL
        </p>
      </div>
    </form>
  );
}
