"use client";

import type {
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import anyAscii from "any-ascii";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import { GenericCharactersTableSkeleton } from "~/components/characters/skeletons";
import type { Session } from "next-auth";
import { CharacterLink } from "~/components/ui/character-link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import React from "react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { useIsMobile } from "~/hooks/use-mobile";
import { VirtualizedList } from "~/components/ui/virtualized-list";
import { cn } from "~/lib/utils";

// Define the 40-man instances in the required order
const FORTY_MAN_INSTANCES = [
  "Molten Core",
  "Blackwing Lair",
  "Temple of Ahn'Qiraj",
  "Naxxramas",
] as const;

// Helper function to format attendance display
const formatAttendance = (attendee: number, bench: number) => {
  if (attendee === 0 && bench === 0) {
    return "";
  }

  let display = attendee.toString();
  if (bench > 0) {
    display += ` (${bench})`;
  }

  return display;
};

// Helper function to render attendance with tooltips
const renderAttendanceWithTooltips = (attendee: number, bench: number) => {
  if (attendee === 0 && bench === 0) {
    return "";
  }

  const tooltipContent =
    bench > 0
      ? `Attended: ${attendee}\nBench: ${bench}`
      : `Attended: ${attendee}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="cursor-help">{formatAttendance(attendee, bench)}</span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="whitespace-pre-line rounded bg-secondary px-3 py-1 text-xs text-muted-foreground shadow transition-all"
      >
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
};

// Helper function to get attendance styling classes
const getAttendanceStyling = (attendee: number) => {
  if (attendee < 4) {
    return "text-muted-foreground italic";
  }
  return "";
};

const zoneAbbreviation = (zone: (typeof FORTY_MAN_INSTANCES)[number]) => {
  if (zone === "Molten Core") return "MC";
  if (zone === "Blackwing Lair") return "BWL";
  if (zone === "Temple of Ahn'Qiraj") return "AQ40";
  return "Naxx";
};

export function CharactersTable({
  characters,
  targetNewTab = false,
  isLoading = false,
  session,
  showRaidColumns = true,
}: {
  characters: RaidParticipantCollection | undefined;
  targetNewTab?: boolean;
  isLoading?: boolean;
  session?: Session;
  showRaidColumns?: boolean;
}) {
  const isMobile = useIsMobile();
  const characterList =
    characters &&
    Object.values(characters).sort((a, b) =>
      anyAscii(a.name) > anyAscii(b.name) ? 1 : -1,
    );

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="min-h-[360px] overflow-y-auto overflow-x-hidden rounded-2xl border border-border/70 md:min-h-[600px] md:border-0">
          <GenericCharactersTableSkeleton
            rows={13}
            showRaidColumns={showRaidColumns}
          />
        </div>
      ) : isMobile ? (
        <VirtualizedList
          items={characterList ?? []}
          itemKey={(character) => character.characterId}
          estimateItemHeight={132}
          overscan={6}
          className="panel-subtle h-[min(68svh,42rem)] rounded-2xl border border-border/70 p-3"
          innerClassName="pr-1"
          emptyState={
            <div className="rounded-2xl border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
              No characters found.
            </div>
          }
          renderItem={(c) => (
            <div className="pb-3">
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CharacterLink
                        characterId={c.characterId}
                        characterName={c.name}
                        characterClass={c.class}
                        primaryCharacterName={c.primaryCharacterName}
                        iconSize={20}
                        target={targetNewTab ? "_blank" : "_self"}
                        className="min-w-0"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        {c.server ? <span>{c.server}</span> : null}
                        {c.class ? (
                          <Badge variant="secondary" className="font-normal">
                            {c.class}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    {session?.user?.isRaidManager ? (
                      <Link
                        href={`/raid-manager/characters?s=${c.name}`}
                        className="rounded-md border border-border p-2 text-muted-foreground transition-all hover:text-primary"
                        aria-label={`Manage ${c.name}`}
                      >
                        <Edit size={16} />
                      </Link>
                    ) : null}
                  </div>

                  {showRaidColumns ? (
                    <div className="flex flex-wrap gap-2">
                      {FORTY_MAN_INSTANCES.map((zone) => {
                        const attendance = c.raidAttendanceByZone?.[zone];
                        const attendee = attendance?.attendee ?? 0;
                        const bench = attendance?.bench ?? 0;
                        const value = formatAttendance(attendee, bench);

                        return (
                          <Badge
                            key={zone}
                            variant="secondary"
                            className="gap-1 font-normal"
                          >
                            <span>{zoneAbbreviation(zone)}</span>
                            <span className={attendee < 4 ? "opacity-70" : ""}>
                              {value || "0"}
                            </span>
                          </Badge>
                        );
                      })}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          )}
        />
      ) : (
        <div className="panel-subtle overflow-hidden rounded-2xl border border-border/70">
          <div
            className={cn(
              "grid items-center gap-3 border-b border-border/70 bg-card/80 px-4 py-3 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground",
              session?.user?.isRaidManager
                ? showRaidColumns
                  ? "grid-cols-[44px_minmax(0,3fr)_minmax(0,1.2fr)_repeat(4,minmax(0,0.7fr))]"
                  : "grid-cols-[44px_minmax(0,3fr)_minmax(0,1.2fr)]"
                : showRaidColumns
                  ? "grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_repeat(4,minmax(0,0.7fr))]"
                  : "grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)]",
            )}
          >
            {session?.user?.isRaidManager ? <div /> : null}
            <div>
              Characters {characterList ? `(${characterList.length})` : ""}
            </div>
            <div>Server</div>
            {showRaidColumns
              ? FORTY_MAN_INSTANCES.map((zone) => (
                  <div key={zone} className="text-center text-xs">
                    {zoneAbbreviation(zone)}
                  </div>
                ))
              : null}
          </div>
          <VirtualizedList
            items={characterList ?? []}
            itemKey={(character) => character.characterId}
            estimateItemHeight={53}
            overscan={12}
            className="h-[min(72svh,48rem)]"
            emptyState={
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No characters found.
              </div>
            }
            renderItem={(c: RaidParticipant) => (
              <div
                className={cn(
                  "grid items-center gap-3 border-b border-border/60 px-4 py-2.5 text-sm transition-colors hover:bg-accent/35",
                  session?.user?.isRaidManager
                    ? showRaidColumns
                      ? "grid-cols-[44px_minmax(0,3fr)_minmax(0,1.2fr)_repeat(4,minmax(0,0.7fr))]"
                      : "grid-cols-[44px_minmax(0,3fr)_minmax(0,1.2fr)]"
                    : showRaidColumns
                      ? "grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)_repeat(4,minmax(0,0.7fr))]"
                      : "grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)]",
                )}
              >
                {session?.user?.isRaidManager ? (
                  <Link
                    href={`/raid-manager/characters?s=${c.name}`}
                    className="text-muted-foreground transition-all hover:text-primary"
                    aria-label={`Manage ${c.name}`}
                  >
                    <Edit size={16} />
                  </Link>
                ) : null}
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center">
                    <CharacterLink
                      characterId={c.characterId}
                      characterName={c.name}
                      characterClass={c.class}
                      primaryCharacterName={c.primaryCharacterName}
                      iconSize={20}
                      target={targetNewTab ? "_blank" : "_self"}
                    />
                    {targetNewTab ? (
                      <ExternalLinkIcon className="ml-1 shrink-0" size={15} />
                    ) : null}
                  </div>
                </div>
                <div className="truncate text-muted-foreground">{c.server}</div>
                {showRaidColumns
                  ? FORTY_MAN_INSTANCES.map((zone) => {
                      const attendance = c.raidAttendanceByZone?.[zone];
                      const attendee = attendance?.attendee ?? 0;
                      const bench = attendance?.bench ?? 0;

                      return (
                        <div
                          key={zone}
                          className={cn(
                            "text-center text-xs",
                            getAttendanceStyling(attendee),
                          )}
                        >
                          {renderAttendanceWithTooltips(attendee, bench)}
                        </div>
                      );
                    })
                  : null}
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
