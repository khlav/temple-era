"use client";

import { formatDistanceToNow } from "date-fns";
import { Moon } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { DiscordDmIcon } from "./queue-type-icon";

export interface WorldBuffCharacterFields {
  characterName: string;
  characterClass: string | null;
  primaryCharacterName: string | null;
  discordUserId?: string | null;
  discordUsername?: string | null;
  /** Manager-set "gone quiet" flag — see `world-buff-schema.ts`. Distinct from `isIdle`, the
   *  computed version below. */
  markedInactiveAt?: Date | string | null;
  /** Computed "gone quiet" signal — see `CharacterEnrichment.isIdle` in world-buff-service.ts. */
  isIdle?: boolean;
  /** ISO date ("YYYY-MM-DD") of the family's most recent raid — only set when `isIdle` is true. */
  idleLastRaidAt?: string | null;
}

/** Cascading "Zzz" glyph — deliberately not another moon icon, so the computed idle signal reads
 *  as visually distinct from the manager-set `markedInactiveAt` flag's plain `Moon` icon even
 *  when both show at once. */
function ZzzIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 15h4L2 19h4" opacity="0.55" />
      <path d="M8 9h5L8 14h5" opacity="0.8" />
      <path d="M14 2h7L14 9h7" />
    </svg>
  );
}

/** Small icon(s) for the manual `markedInactiveAt` flag and/or the computed `isIdle` signal.
 *  Renders nothing when neither applies. */
function CharacterStatusIcons({
  markedInactive,
  isIdle,
}: {
  markedInactive: boolean;
  isIdle: boolean;
}) {
  if (!markedInactive && !isIdle) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {markedInactive && <Moon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
      {isIdle && <ZzzIcon className="h-3.5 w-3.5 text-blue-500" />}
    </span>
  );
}

/** Tooltip body for the combined status indicator — manual flag first, then (separated by a
 *  divider when both apply) the computed idle signal with its "last raid" detail. */
function CharacterStatusTooltipContent({
  markedInactiveAt,
  isIdle,
  idleLastRaidAt,
}: {
  markedInactiveAt: Date | string;
  isIdle: boolean;
  idleLastRaidAt: string | null;
}) {
  const lastRaidDate = idleLastRaidAt ? new Date(`${idleLastRaidAt}T12:00:00Z`) : null;
  return (
    <TooltipContent className="bg-secondary text-muted-foreground">
      <div>Marked inactive {formatEasternDateTime(new Date(markedInactiveAt), "M/d/yyyy")}</div>
      {isIdle && <div className="my-1 h-px bg-border" />}
      {isIdle && lastRaidDate && (
        <div>
          Player&apos;s last raid was {formatDistanceToNow(lastRaidDate, { addSuffix: true })} (
          {formatEasternDateTime(lastRaidDate, "M/d/yyyy")})
        </div>
      )}
    </TooltipContent>
  );
}

/** Tooltip body when only the computed `isIdle` signal applies (no manual flag). */
function IdleOnlyTooltipContent({ lastRaidDate }: { lastRaidDate: Date | null }) {
  if (!lastRaidDate) return null;
  return (
    <TooltipContent className="bg-secondary text-muted-foreground">
      Player&apos;s last raid was {formatDistanceToNow(lastRaidDate, { addSuffix: true })} (
      {formatEasternDateTime(lastRaidDate, "M/d/yyyy")})
    </TooltipContent>
  );
}

/** Class icon + character name, with its primary's name (if it's an alt) deemphasized to the
 *  right, and — for worldbuff:manage viewers where a Discord identity resolved — the DM icon
 *  inline right after it. Shared between the queue columns and the scheduled-turn-ins section
 *  so linked characters look identical in both places.
 *
 *  When either "gone quiet" signal is present, the icon+class+name group (NOT the Discord icon,
 *  which has its own separate tooltip) becomes a single hover target for a combined tooltip. */
export function WorldBuffCharacterIdentity({
  character,
  showDiscord = false,
  dropped = false,
}: {
  character: WorldBuffCharacterFields;
  showDiscord?: boolean;
  /** Grays the class icon for an already-dropped row, matching `WorldBuffIcon`'s `grayscale`. */
  dropped?: boolean;
}) {
  const markedInactive = !!character.markedInactiveAt;
  const isIdle = !!character.isIdle;
  const hasStatusFlags = markedInactive || isIdle;
  const lastRaidDate = character.idleLastRaidAt
    ? new Date(`${character.idleLastRaidAt}T12:00:00Z`)
    : null;

  const identityGroup = (
    <div className="flex min-w-0 items-center gap-2">
      <CharacterStatusIcons markedInactive={markedInactive} isIdle={isIdle} />
      {character.characterClass && (
        <ClassIcon
          characterClass={character.characterClass}
          px={18}
          className={dropped ? "grayscale" : undefined}
        />
      )}
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="truncate text-sm font-medium">{character.characterName}</span>
        {character.primaryCharacterName && (
          <span className="shrink-0 truncate text-xs text-muted-foreground">
            {character.primaryCharacterName}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-w-0 items-center gap-2">
      {hasStatusFlags ? (
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>{identityGroup}</TooltipTrigger>
          {markedInactive ? (
            <CharacterStatusTooltipContent
              markedInactiveAt={character.markedInactiveAt!}
              isIdle={isIdle}
              idleLastRaidAt={character.idleLastRaidAt ?? null}
            />
          ) : (
            <IdleOnlyTooltipContent lastRaidDate={lastRaidDate} />
          )}
        </Tooltip>
      ) : (
        identityGroup
      )}
      {showDiscord && character.discordUserId && (
        <DiscordDmIcon
          discordUserId={character.discordUserId}
          discordUsername={character.discordUsername ?? null}
        />
      )}
    </div>
  );
}
