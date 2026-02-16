"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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
  History,
  ChevronDown,
} from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { MRTCodec } from "~/lib/mrt-codec";
import { useToast } from "~/hooks/use-toast";
import { useSession } from "next-auth/react";
import { WOW_SERVERS, VALID_WRITE_IN_CLASSES } from "./constants";
import { FindGamersDialog } from "./find-gamers-dialog";
import type { SignupMatchResult } from "~/server/api/routers/raid-helper";
import { Badge } from "~/components/ui/badge";
import { ZoneSelect } from "./zone-select";
import { ScheduledEventsTable } from "./scheduled-events-table";
import { PastPlansTable } from "./past-plans-table";
import { UrlImportForm } from "./url-import-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

// Detect zone from event title
function detectZoneFromTitle(title: string): string | null {
  const zonePatterns: Array<{ pattern: RegExp; zoneId: string }> = [
    { pattern: /\bbwl\b|blackwing/i, zoneId: "bwl" },
    { pattern: /\bmc\b|molten\s*core/i, zoneId: "mc" },
    { pattern: /\bnaxx?\b|naxxramas/i, zoneId: "naxxramas" },
    { pattern: /\bony\b|onyxia/i, zoneId: "onyxia" },
    { pattern: /\baq20\b|ruins/i, zoneId: "aq20" },
    { pattern: /\baq40\b|temple\s*of\s*ahn/i, zoneId: "aq40" },
    { pattern: /\bzg\b|zul.?gurub/i, zoneId: "zg" },
  ];

  let firstMatch: { index: number; zoneId: string } | null = null;

  for (const { pattern, zoneId } of zonePatterns) {
    const match = pattern.exec(title);
    if (match) {
      if (!firstMatch || match.index < firstMatch.index) {
        firstMatch = { index: match.index, zoneId };
      }
    }
  }

  return firstMatch?.zoneId ?? null;
}

// State for Find Players dialog
interface FindPlayersState {
  eventId: string;
  eventTitle: string;
  eventStartTime: number;
  detectedZone: string | null;
  matchResults: SignupMatchResult[];
}

export function RaidPlannerImport() {
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [findPlayersState, setFindPlayersState] =
    useState<FindPlayersState | null>(null);
  const [isUrlImportOpen, setIsUrlImportOpen] = useState(false);

  const {
    data: events,
    isLoading,
    error,
  } = api.raidHelper.getScheduledEvents.useQuery({
    allowableHoursPastStart: 1,
  });

  // Fetch existing plans for all events
  const eventIds = events?.map((e) => e.id) ?? [];
  const { data: existingPlans } =
    api.raidPlan.getExistingPlansForEvents.useQuery(
      { raidHelperEventIds: eventIds },
      { enabled: eventIds.length > 0 },
    );

  // Fetch past plans (not linked to current scheduled events)
  const { data: pastPlans, isLoading: isLoadingPastPlans } =
    api.raidPlan.getPastPlans.useQuery({
      currentEventIds: eventIds,
      limit: 20,
    });

  const handleFindPlayers = useCallback(
    (
      eventId: string,
      eventTitle: string,
      eventStartTime: number,
      matchResults: SignupMatchResult[],
    ) => {
      const detectedZone = detectZoneFromTitle(eventTitle);
      setFindPlayersState({
        eventId,
        eventTitle,
        eventStartTime,
        detectedZone,
        matchResults,
      });
    },
    [],
  );

  return (
    <div className="space-y-8">
      {/* Scheduled Raids Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <Calendar className="h-5 w-5" />
            Scheduled Raids
          </h3>
          <Dialog open={isUrlImportOpen} onOpenChange={setIsUrlImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Link2 className="mr-2 h-4 w-4" />
                Import from URL
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import from Raid-Helper</DialogTitle>
              </DialogHeader>
              <UrlImportForm
                onEventSelect={setSelectedEventId}
                onSuccess={() => setIsUrlImportOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>

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
        ) : (
          <ScheduledEventsTable
            events={events}
            existingPlans={existingPlans}
            onFindPlayers={handleFindPlayers}
            onSelectEvent={setSelectedEventId}
          />
        )}
      </div>

      {/* Character Matching Dialog */}
      <CharacterMatchingDialog
        eventId={selectedEventId}
        open={!!selectedEventId}
        onOpenChange={(open) => !open && setSelectedEventId(null)}
        pastPlans={pastPlans}
      />

      {/* Find Players Dialog */}
      {findPlayersState && (
        <FindGamersDialog
          open={!!findPlayersState}
          onOpenChange={(open) => !open && setFindPlayersState(null)}
          eventId={findPlayersState.eventId}
          eventTitle={findPlayersState.eventTitle}
          eventStartTime={findPlayersState.eventStartTime}
          detectedZone={findPlayersState.detectedZone}
          currentSignups={findPlayersState.matchResults}
        />
      )}

      {/* Past Plans Section */}
      <div className="space-y-4 pt-4">
        <h3 className="flex items-center gap-2 font-semibold">
          <History className="h-5 w-5" />
          Past Plans
        </h3>
        {isLoadingPastPlans ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <PastPlansTable plans={pastPlans} />
        )}
      </div>
    </div>
  );
}

interface CharacterMatchingDialogProps {
  eventId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pastPlans?: RouterOutputs["raidPlan"]["getPastPlans"];
}

function CharacterMatchingDialog({
  eventId,
  open,
  onOpenChange,
  pastPlans,
}: CharacterMatchingDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();
  const [homeServer, setHomeServer] = useState("");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [cloneFromPlanId, setCloneFromPlanId] = useState<string | null>(null);
  const [cloneFromPlanName, setCloneFromPlanName] = useState<string | null>(
    null,
  );

  // Default home server to user's primary character server
  const characterId = session?.user?.characterId;
  const { data: userCharacter } = api.character.getCharacterById.useQuery(
    characterId ?? -1,
    { enabled: !!characterId },
  );

  useEffect(() => {
    if (userCharacter?.server && !homeServer) {
      setHomeServer(userCharacter.server);
    }
  }, [userCharacter?.server, homeServer]);

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
  const autoDetectedZone = useMemo(() => {
    const rawTitle =
      eventDetails?.event.displayTitle || eventDetails?.event.title;
    if (!rawTitle) return null;
    return detectZoneFromTitle(rawTitle);
  }, [eventDetails?.event.displayTitle, eventDetails?.event.title]);

  const effectiveZone = selectedZone ?? autoDetectedZone;

  // Initialize selectedZone from auto-detection when match results load
  useEffect(() => {
    if (matchResults && autoDetectedZone && !selectedZone) {
      setSelectedZone(autoDetectedZone);
    }
  }, [matchResults, autoDetectedZone, selectedZone]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSelectedZone(null);
      setCloneFromPlanId(null);
      setCloneFromPlanName(null);
    }
  }, [open]);

  const [copied, setCopied] = useState(false);

  const createPlanMutation = api.raidPlan.create.useMutation({
    onSuccess: (data) => {
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
    if (!eventId || !eventDetails || !matchResults || !effectiveZone) return;

    // Build characters array from match results (excluding absent signups)
    const characters = matchResults
      .filter((r) => {
        const lowerClass = r.className.toLowerCase();
        return lowerClass !== "absent" && lowerClass !== "absence";
      })
      .map((r) => {
        // Convert partyId/slotId from 1-indexed to 0-indexed
        // Groups 9+ are bench (null group and position)
        const defaultGroup =
          r.partyId !== null && r.partyId <= 8 ? r.partyId - 1 : null;
        const defaultPosition =
          defaultGroup !== null && r.slotId !== null ? r.slotId - 1 : null;

        // Use matched character name if available, otherwise use discord name
        const characterName =
          r.status === "matched" && r.matchedCharacter
            ? r.matchedCharacter.characterName
            : r.discordName;

        const characterId =
          r.status === "matched" && r.matchedCharacter
            ? r.matchedCharacter.characterId
            : null;

        // For unmatched characters, pass their RaidHelper class as writeInClass
        // Only allow valid WoW classes and recognized RaidHelper statuses (Bench, Tentative, Late)
        const normalizedClass = r.className
          ? r.className.charAt(0).toUpperCase() +
            r.className.slice(1).toLowerCase()
          : null;
        const writeInClass =
          !characterId &&
          normalizedClass &&
          VALID_WRITE_IN_CLASSES.has(normalizedClass)
            ? normalizedClass
            : null;

        return {
          characterId,
          characterName,
          defaultGroup,
          defaultPosition,
          writeInClass,
        };
      });

    createPlanMutation.mutate({
      raidHelperEventId: eventId,
      name: eventDetails.event.displayTitle || eventDetails.event.title,
      zoneId: effectiveZone,
      startAt: new Date(eventDetails.event.startTime * 1000),
      characters,
      cloneFromPlanId: cloneFromPlanId ?? undefined,
    });
  }, [
    eventId,
    eventDetails,
    matchResults,
    effectiveZone,
    createPlanMutation,
    cloneFromPlanId,
  ]);

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
        if (
          result.matchedCharacter.characterServer &&
          result.matchedCharacter.characterServer !== homeServer
        ) {
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
  }, [matchResults, eventDetails?.plan?.slotPerParty, homeServer]);

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
          <DialogFooter className="sm:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* Zone selector */}
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  Zone Template:
                  {autoDetectedZone && effectiveZone === autoDetectedZone && (
                    <Badge
                      variant="secondary"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      Auto
                    </Badge>
                  )}
                </label>
                <ZoneSelect
                  value={effectiveZone ?? undefined}
                  onValueChange={setSelectedZone}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Server selector */}
              <div className="flex items-center gap-2">
                <label
                  className="text-sm text-muted-foreground"
                  htmlFor="home-server-select"
                >
                  My server:
                </label>
                <select
                  id="home-server-select"
                  value={homeServer}
                  onChange={(e) => setHomeServer(e.target.value)}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">All servers</option>
                  {WOW_SERVERS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleCopyMRT} variant="outline">
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied!" : "Copy MRT Export"}
              </Button>
              <div className="flex items-center">
                <Button
                  onClick={handleCreatePlan}
                  disabled={!effectiveZone || createPlanMutation.isPending}
                  className="max-w-[230px] rounded-r-none"
                  title={
                    cloneFromPlanName ||
                    (!effectiveZone
                      ? "Please select a zone to create the plan"
                      : "Create Plan")
                  }
                >
                  <span className="block truncate">
                    {createPlanMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      </>
                    ) : cloneFromPlanId ? (
                      `Cloning: ${cloneFromPlanName}`
                    ) : (
                      "Create Plan"
                    )}
                  </span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      className="rounded-l-none border-l border-primary-foreground/20 px-2"
                      disabled={createPlanMutation.isPending}
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      Clone From Recent Plan
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      <DropdownMenuItem
                        onSelect={() => {
                          setCloneFromPlanId(null);
                          setCloneFromPlanName(null);
                        }}
                        className="italic text-primary"
                      >
                        Create new plan (default)
                      </DropdownMenuItem>
                      {pastPlans && pastPlans.length > 0 ? (
                        pastPlans.slice(0, 10).map((plan) => (
                          <DropdownMenuItem
                            key={plan.id}
                            onSelect={() => {
                              setCloneFromPlanId(plan.id);
                              setCloneFromPlanName(plan.name);
                              // Auto-select zone if available in the past plan
                              if (plan.zoneId) {
                                setSelectedZone(plan.zoneId);
                              }
                            }}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{plan.name}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {plan.startAt
                                  ? new Date(plan.startAt).toLocaleDateString()
                                  : plan.zoneId}
                              </span>
                            </div>
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                          No past plans found
                        </div>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
