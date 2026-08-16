"use client";

import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Clock, UserPlus } from "lucide-react";
import { useSession } from "next-auth/react";
import { api, type RouterOutputs } from "~/trpc/react";
import { Card, CardContent } from "~/components/ui/card";
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
      <div className="flex w-full min-w-0 items-center justify-center gap-2.5 px-[10px] py-2.5 lg:flex-1">
        {buff === "dragon" ? (
          <DragonBuffIcon size={40} grayscale />
        ) : (
          <BuffIcon buff={buff} size={40} className="shrink-0 grayscale" />
        )}
        <span className="truncate text-sm font-medium text-primary">Not scheduled</span>
      </div>
    );
  }

  const { status } = assignment;
  return (
    <div
      className={cn(
        "flex w-full min-w-0 items-center justify-center gap-2.5 px-[10px] py-2.5 lg:flex-1",
        isMine && "m-1.5 rounded-md border border-cyan-400/60 bg-cyan-400/15",
      )}
    >
      <WorldBuffIcon
        item={status.item as WorldBuffItem}
        size={40}
        className="shrink-0 rounded-sm"
      />
      {status.characterClass && (
        <>
          <div className="h-6 w-px shrink-0 bg-border/60" />
          <ClassIcon characterClass={status.characterClass} px={28} />
        </>
      )}
      <div className="min-w-0 max-w-[7rem] leading-tight">
        <div
          className={cn(
            "font-display truncate text-[1.05rem] font-semibold",
            isMine && "text-cyan-200",
          )}
        >
          {status.characterName}
        </div>
        {status.primaryCharacterName && (
          <div className="truncate text-[11px] leading-tight text-muted-foreground">
            {status.primaryCharacterName}
          </div>
        )}
      </div>
      <span className="ml-1.5 flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {formatEasternDateTime(new Date(assignment.scheduledAt), "h:mm a")}
      </span>
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
    <Card>
      <CardContent className="flex flex-col divide-y divide-border/60 p-0 sm:p-0 lg:flex-row lg:items-stretch lg:divide-x lg:divide-y-0">
        <div className="flex w-full flex-nowrap items-center justify-center gap-1.5 px-[30px] py-2.5 text-center lg:w-auto lg:shrink-0 lg:flex-col lg:gap-0.5">
          <span className="shrink-0 whitespace-nowrap text-sm font-medium">World Buff Drops</span>
          {nextAssignment && (
            <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-primary">
              {formatEasternDateTime(new Date(nextAssignment.scheduledAt), "EEEE, MMMM do")}
            </span>
          )}
        </div>

        {BUFF_SLOT_ORDER.map((buff) => {
          const assignment = assignmentByBuff.get(buff);
          const isMine =
            assignment?.status.characterId != null &&
            myCharacterIds.has(assignment.status.characterId);
          return <BuffSlot key={buff} buff={buff} assignment={assignment} isMine={isMine} />;
        })}

        <div className="flex w-full items-center justify-center px-[30px] py-2.5 lg:w-auto lg:shrink-0 lg:justify-start">
          <Button size="sm" asChild>
            <Link href="/world-buffs">
              <UserPlus className="h-4 w-4" />
              Join the Drop List
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
