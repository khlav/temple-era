"use client";

import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { UserPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { ClassIcon } from "~/components/ui/class-icon";
import { BuffIcon, DragonBuffIcon, WorldBuffIcon } from "~/components/world-buffs/world-buff-icon";
import { EASTERN_TIMEZONE, formatEasternDateTime } from "~/lib/raid-formatting";
import { cn } from "~/lib/utils";
import { WORLD_BUFF_BY_ITEM, type WorldBuff, type WorldBuffItem } from "~/lib/world-buffs";

type ActiveAssignment = RouterOutputs["worldBuff"]["listActiveAssignments"][number];

// Fixed left-to-right order for the 3 buff slots — matches the tiebreak order raid leads
// actually call turn-ins in (see assignment-list.tsx's WORLD_BUFF_SORT_ORDER).
const BUFF_SLOT_ORDER: WorldBuff[] = ["zg", "dragon", "rend"];

// Fallback label for an unscheduled slot, which has no character to name instead — the full
// in-game buff name (WORLD_BUFF_LABELS) is too long for this compact card.
const BUFF_SHORT_LABEL: Record<WorldBuff, string> = {
  rend: "Rend",
  dragon: "Dragon",
  zg: "Hakkar",
};

function BuffSlot({
  buff,
  assignment,
  isMine,
}: {
  buff: WorldBuff;
  assignment?: ActiveAssignment;
  isMine: boolean;
}) {
  if (!assignment) {
    return (
      <div className="flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border border-primary/40 bg-primary/8 px-3.5 py-3">
        {buff === "dragon" ? (
          <DragonBuffIcon size={40} grayscale />
        ) : (
          <BuffIcon buff={buff} size={40} className="shrink-0 rounded-md opacity-70 grayscale" />
        )}
        <div className="min-w-0">
          <div className="text-[13px] text-muted-foreground">{BUFF_SHORT_LABEL[buff]}</div>
          <div className="font-display mt-0.5 text-[1.05rem] font-semibold text-primary">
            Not scheduled
          </div>
        </div>
      </div>
    );
  }

  const { status } = assignment;
  return (
    <div
      className={cn(
        "flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-3.5 py-3",
        isMine && "border-cyan-400/60 bg-cyan-400/12",
      )}
    >
      <WorldBuffIcon
        item={status.item as WorldBuffItem}
        size={40}
        className="shrink-0 rounded-md"
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {status.characterClass && <ClassIcon characterClass={status.characterClass} px={14} />}
          <span
            className={cn(
              "truncate text-[13px] text-muted-foreground",
              isMine && "text-cyan-200/85",
            )}
          >
            {status.characterName}
          </span>
        </div>
        <div
          className={cn(
            "font-display mt-0.5 text-[1.05rem] font-semibold",
            isMine && "text-cyan-200",
          )}
        >
          {formatEasternDateTime(new Date(assignment.scheduledAt), "h:mm a")}
        </div>
      </div>
    </div>
  );
}

export function UpcomingWorldBuffDrops() {
  const { data: session } = useSession();
  // The full family — self + primary + all alts/siblings — not just the exact character linked
  // to the account, so an alt's turn-in still highlights for the signed-in main (and vice versa).
  const { data: profile } = api.profile.getMyProfile.useQuery(undefined, {
    enabled: !!session,
  });
  const myCharacterIds = new Set(profile?.userCharacterIds ?? []);
  const { data: assignments } = api.worldBuff.listActiveAssignments.useQuery();

  const sorted = (assignments ?? [])
    .slice()
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

  // "The next scheduled set of drops" = whatever Eastern calendar date the soonest active
  // assignment falls on. Only assignments on that same date populate the row below — a buff
  // with something scheduled on a later date still shows as "Not scheduled yet" here, since
  // this widget is a snapshot of one day, not a full schedule.
  const nextAssignment = sorted[0];
  const nextDateKey = nextAssignment
    ? formatInTimeZone(new Date(nextAssignment.scheduledAt), EASTERN_TIMEZONE, "yyyy-MM-dd")
    : null;
  const rowAssignments = nextDateKey
    ? sorted.filter(
        (a) =>
          formatInTimeZone(new Date(a.scheduledAt), EASTERN_TIMEZONE, "yyyy-MM-dd") === nextDateKey,
      )
    : [];

  const assignmentByBuff = new Map<WorldBuff, ActiveAssignment>();
  for (const a of rowAssignments) {
    const buff = WORLD_BUFF_BY_ITEM[a.status.item as WorldBuffItem];
    if (!assignmentByBuff.has(buff)) assignmentByBuff.set(buff, a);
  }

  return (
    <div className="panel-surface overflow-hidden rounded-2xl border border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="font-display min-w-0 truncate text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          Tuesday Buff Drops
          {nextAssignment && (
            <span className="normal-case tracking-normal">
              {" "}
              — Starting at {formatEasternDateTime(new Date(nextAssignment.scheduledAt), "h:mm a")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/world-buffs"
            className="text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            World buffs
          </Link>
          <Button size="sm" variant="outline" asChild className="h-7 rounded-lg px-2.5 text-xs">
            <Link href="/world-buffs">
              <UserPlus className="h-3.5 w-3.5" />
              Join the Drop List
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 p-4">
        {BUFF_SLOT_ORDER.map((buff) => {
          const assignment = assignmentByBuff.get(buff);
          const isMine =
            assignment?.status.characterId != null &&
            myCharacterIds.has(assignment.status.characterId);
          return <BuffSlot key={buff} buff={buff} assignment={assignment} isMine={isMine} />;
        })}
      </div>
    </div>
  );
}
