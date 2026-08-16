"use client";

import Link from "next/link";
import { Edit } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { Progress } from "~/components/ui/progress";
import type { RaidParticipant } from "~/server/api/interfaces/raid";
import type { Session } from "next-auth";
import { cn } from "~/lib/utils";

export interface RosterAttendance {
  characterId: number | null;
  weightedAttendance: number | null;
  weightedRaidTotal: number | null;
  weightedAttendancePct: number | null;
}

interface RosterGroup {
  main: RaidParticipant;
  alts: RaidParticipant[];
}

const GRID_COLS = "grid-cols-[minmax(0,1fr)_116px_320px_60px]";

function AttendanceCell({ attendance }: { attendance?: RosterAttendance }) {
  const pct = Math.round((attendance?.weightedAttendancePct ?? 0) * 100);
  const credits = attendance?.weightedAttendance ?? 0;
  const total = attendance?.weightedRaidTotal ?? 0;
  const isAboveThreshold = pct >= 50;

  return (
    <div className="flex items-center gap-2.5">
      <span
        className={cn(
          "font-display w-9 shrink-0 text-right text-sm font-bold",
          isAboveThreshold ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {pct}%
      </span>
      <div className="relative min-w-0 flex-1">
        <Progress
          value={pct}
          className="h-3.5 bg-muted"
          indicatorClassName={isAboveThreshold ? "bg-primary" : "bg-muted-foreground/45"}
        />
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 border-l-2 border-dotted",
            isAboveThreshold ? "border-background" : "border-muted-foreground",
          )}
          style={{ left: "50%" }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-xs text-muted-foreground">
        {credits} / {total}
      </span>
    </div>
  );
}

function MainRow({
  main,
  hasAlts,
  attendance,
  isManager,
}: {
  main: RaidParticipant;
  hasAlts: boolean;
  attendance?: RosterAttendance;
  isManager: boolean;
}) {
  return (
    <div className={cn("grid items-center gap-3 border-b border-border/45 px-4 py-2.5", GRID_COLS)}>
      <div className="flex min-w-0 items-center gap-2">
        <ClassIcon
          characterClass={main.class.toLowerCase()}
          px={22}
          className="shrink-0 rounded-sm"
        />
        <Link
          href={`/characters/${main.characterId}`}
          className="truncate text-sm font-medium text-secondary-foreground transition-all hover:text-primary"
        >
          {main.name}
        </Link>
        {hasAlts ? (
          <span className="font-display shrink-0 rounded-md border border-border/90 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            main
          </span>
        ) : null}
      </div>
      <div className="truncate text-sm text-muted-foreground">{main.server}</div>
      <AttendanceCell attendance={attendance} />
      {isManager ? (
        <Link
          href={`/raid-manager/characters?s=${main.name}`}
          className="justify-self-end text-muted-foreground transition-all hover:text-primary"
          aria-label={`Manage ${main.name}`}
        >
          <Edit size={16} />
        </Link>
      ) : null}
    </div>
  );
}

function AltRow({ alt, mainName }: { alt: RaidParticipant; mainName: string }) {
  const attended = Object.values(alt.raidAttendanceByZone ?? {}).reduce(
    (sum, zone) => sum + (zone?.attendee ?? 0),
    0,
  );

  return (
    <div
      className={cn(
        "grid items-center gap-3 border-b border-border/45 bg-muted/20 py-1.5 pl-[42px] pr-4",
        GRID_COLS,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="mb-1 h-3 w-3 shrink-0 rounded-bl border-b border-l border-border/80" />
        <ClassIcon
          characterClass={alt.class.toLowerCase()}
          px={18}
          className="shrink-0 rounded-sm opacity-85"
        />
        <Link
          href={`/characters/${alt.characterId}`}
          className="truncate text-[13px] text-foreground/85 transition-all hover:text-primary"
        >
          {alt.name}
        </Link>
        <span className="font-display shrink-0 text-[10px] uppercase tracking-[0.1em] text-muted-foreground/70">
          alt
        </span>
      </div>
      <div />
      <div className="truncate text-xs text-muted-foreground/80">
        {attended} raid{attended === 1 ? "" : "s"} this window · credited to {mainName}
      </div>
      <div />
    </div>
  );
}

export function CharactersRosterList({
  groups,
  attendanceByCharacterId,
  session,
}: {
  groups: RosterGroup[];
  attendanceByCharacterId: Map<number, RosterAttendance>;
  session?: Session;
}) {
  const isManager = !!session?.user?.isRaidManager;

  return (
    <div className="panel-subtle overflow-hidden rounded-2xl border border-border/70">
      <div
        className={cn(
          "grid items-center gap-3 border-b border-border/70 bg-card/80 px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground",
          GRID_COLS,
        )}
      >
        <div>Character</div>
        <div>Server</div>
        <div>Attendance</div>
        <div />
      </div>
      {groups.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No characters found.
        </div>
      ) : (
        groups.map(({ main, alts }) => (
          <div key={main.characterId}>
            <MainRow
              main={main}
              hasAlts={alts.length > 0}
              attendance={attendanceByCharacterId.get(main.characterId)}
              isManager={isManager}
            />
            {alts.map((alt) => (
              <AltRow key={alt.characterId} alt={alt} mainName={main.name} />
            ))}
          </div>
        ))
      )}
      <div className="border-t border-border/55 px-4 py-2.5 text-xs text-muted-foreground">
        Attendance is per player: the bar sits on the main and alt raids feed into it. Dotted line
        marks the 50% eligibility threshold.
      </div>
    </div>
  );
}
