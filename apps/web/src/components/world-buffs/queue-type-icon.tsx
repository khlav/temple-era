import { CircleCheck, UserRound, Shield, StickyNote, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { DiscordIcon } from "~/components/ui/discord-icon";

export type WorldBuffQueueType = "main" | "alt" | "backup";

/** Icon + color per queue type, shared between the queue lists (combined with ready/dropped
 *  state) and the character picker in the schedule dialog (queue type alone, no state). */
export const QUEUE_TYPE_ICON: Record<
  WorldBuffQueueType,
  { Icon: LucideIcon; className: string; label: string }
> = {
  main: { Icon: CircleCheck, className: "text-queue-main", label: "Main" },
  alt: { Icon: UserRound, className: "text-queue-alt", label: "Alt" },
  backup: { Icon: Shield, className: "text-primary", label: "Backup" },
};

/** Gray notes icon shown to the left of the queue-type icon whenever a submission has notes;
 *  the caller must skip rendering it entirely when notes are blank. Shared between the queue
 *  list and the character picker in the schedule dialog, so both surfaces stay in sync. */
export function NotesIndicator({ notes }: { notes: string }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">
          <StickyNote className="h-4 w-4 text-muted-foreground" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs bg-secondary text-muted-foreground">
        {notes}
      </TooltipContent>
    </Tooltip>
  );
}

/** Discord-brand icon, shown only to worldbuff:manage viewers when the submission resolves to a
 *  known Discord identity (see `loadCharacterEnrichment` in world-buff-service.ts — most
 *  free-text submissions won't). Opens that person's Discord profile in a new tab so a manager
 *  can go straight to messaging them; `delayDuration={0}` shows the username tooltip instantly
 *  rather than after the usual hover delay, since this is meant to be skimmed at a glance across
 *  a whole queue. Shows the raw Discord username (`profile.username` at sign-in, see
 *  auth/config.ts), not a display/nickname. */
export function DiscordDmIcon({
  discordUserId,
  discordUsername,
}: {
  discordUserId: string;
  discordUsername: string | null;
}) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <a
          href={`https://discord.com/users/${discordUserId}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Message ${discordUsername ?? "on Discord"}`}
          className="inline-flex shrink-0 -translate-y-[2px] self-end text-muted-foreground/50 hover:text-[#5865F2]"
        >
          <DiscordIcon className="h-3.5 w-3.5" />
        </a>
      </TooltipTrigger>
      <TooltipContent className="bg-secondary text-muted-foreground">
        {discordUsername ?? "Open Discord profile"}
      </TooltipContent>
    </Tooltip>
  );
}
