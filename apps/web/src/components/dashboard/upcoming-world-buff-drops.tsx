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

// Short display names for the slot's first line — WORLD_BUFF_LABELS in ~/lib/world-buffs is the
// full in-game buff name ("Rallying Cry of the Dragonslayer"), too long for this compact card.
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
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-muted-foreground">{BUFF_SHORT_LABEL[buff]}</span>
          <span className="font-display text-[13px] font-bold text-muted-foreground">
            {formatEasternDateTime(new Date(assignment.scheduledAt), "h:mm a")}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {status.characterClass && <ClassIcon characterClass={status.characterClass} px={20} />}
          <span
            className={cn(
              "font-display truncate text-[1.05rem] font-semibold",
              isMine && "text-cyan-200",
            )}
          >
            {status.characterName}
          </span>
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
  const { data: statuses } = api.worldBuff.getAll.useQuery();

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

  // Nudge the signed-in user toward the form when none of their own characters have submitted
  // availability for anything at all (any state, any item) — mirrors the hi-fi mock's
  // "Halvorn isn't on any drop list yet." prompt.
  const myCharacterName = profile?.character?.name;
  const amOnAnyList = (statuses ?? []).some(
    (s) => s.characterId != null && myCharacterIds.has(s.characterId),
  );
  const showJoinPrompt = !!session && !!myCharacterName && !amOnAnyList;

  return (
    <div className="panel-surface overflow-hidden rounded-2xl border border-border/70">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          Tuesday Buff Drops
        </div>
        <Link
          href="/world-buffs"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          World buffs
        </Link>
      </div>

      <div className={cn("flex flex-wrap gap-3 p-4", showJoinPrompt && "pb-3")}>
        {BUFF_SLOT_ORDER.map((buff) => {
          const assignment = assignmentByBuff.get(buff);
          const isMine =
            assignment?.status.characterId != null &&
            myCharacterIds.has(assignment.status.characterId);
          return <BuffSlot key={buff} buff={buff} assignment={assignment} isMine={isMine} />;
        })}
      </div>

      {showJoinPrompt && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3">
          <div className="text-[13px] text-muted-foreground">
            {myCharacterName} isn&apos;t on any drop list yet.
          </div>
          <Button size="sm" variant="outline" asChild className="rounded-lg">
            <Link href="/world-buffs">
              <UserPlus className="h-3.5 w-3.5" />
              Join the drop list
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
