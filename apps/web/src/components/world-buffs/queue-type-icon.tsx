import { CircleCheck, UserRound, Shield, StickyNote, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";

export type WorldBuffQueueType = "main" | "alt" | "backup";

/** Icon + color per queue type, shared between the queue lists (combined with ready/dropped
 *  state) and the character picker in the schedule dialog (queue type alone, no state). */
export const QUEUE_TYPE_ICON: Record<
  WorldBuffQueueType,
  { Icon: LucideIcon; className: string; label: string }
> = {
  main: { Icon: CircleCheck, className: "text-chart-2", label: "Main" },
  alt: { Icon: UserRound, className: "text-chart-4", label: "Alt" },
  backup: { Icon: Shield, className: "text-primary", label: "Backup" },
};

/** Gray notes icon shown to the left of the queue-type icon whenever a submission has notes;
 *  the caller must skip rendering it entirely when notes are blank. Shared between the queue
 *  list and the character picker in the schedule dialog, so both surfaces stay in sync. */
export function NotesIndicator({ notes }: { notes: string }) {
  return (
    <Tooltip>
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
