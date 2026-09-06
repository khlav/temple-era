"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterLink } from "~/components/ui/character-link";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import type {
  ComparisonCell,
  ComparisonMember,
  SignupAttendanceComparison,
} from "~/server/services/signup-attendance-comparison";

const EYEBROW_CLASSNAME = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

type Filter = "all" | "exceptions" | "unmatched";

function matchesQuery(name: string, query: string): boolean {
  return query.trim() === "" || name.toLowerCase().includes(query.trim().toLowerCase());
}

function MemberRow({ member }: { member: ComparisonMember }) {
  if (member.characterId === null) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 truncate text-[13px] text-muted-foreground">
        <ClassIcon
          characterClass={(member.characterClass ?? "unknown").toLowerCase()}
          px={16}
          className="shrink-0 rounded-[4px] opacity-45"
        />
        <span className="truncate">{member.name}</span>
      </span>
    );
  }
  return (
    <div className="min-w-0 rounded-md p-1 hover:bg-secondary/50">
      <CharacterLink
        characterId={member.characterId}
        characterName={member.name}
        characterClass={member.characterClass ?? "unknown"}
        iconSize={18}
        className="text-[13px]"
      />
    </div>
  );
}

interface CellSpec {
  cell: ComparisonCell;
  label: string;
  note: string;
  cols: 1 | 3;
}

function MatrixCell({ spec, query, dashed }: { spec: CellSpec; query: string; dashed: boolean }) {
  const shown = spec.cell.members.filter((m) => matchesQuery(m.name, query));
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl",
        dashed
          ? "min-h-[104px] border border-dashed border-border/70 bg-card/70"
          : "panel-surface border border-border/70",
      )}
    >
      <div className="flex items-baseline gap-2 border-b border-border/50 px-3.5 py-2.5">
        <span className="font-display text-lg font-extrabold leading-none">{shown.length}</span>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {spec.label}
        </span>
        {spec.note ? (
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">{spec.note}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "grid gap-x-1 gap-y-0.5 px-2.5 py-2 pb-3",
          spec.cols === 3 ? "grid-cols-3" : "grid-cols-1",
        )}
      >
        {shown.map((m) => (
          <MemberRow key={m.characterId ?? m.name} member={m} />
        ))}
      </div>
    </div>
  );
}

function StatBlock({
  value,
  label,
  colorClassName,
}: {
  value: number;
  label: string;
  colorClassName?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("font-display text-[22px] font-extrabold leading-none", colorClassName)}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-1 font-mono text-[11px]",
        active
          ? "border-primary/50 bg-primary/14 text-primary"
          : "border-border/90 bg-secondary/60 text-muted-foreground",
      )}
    >
      {label} {count}
    </button>
  );
}

function SignupAttendanceComparisonView({ data }: { data: SignupAttendanceComparison }) {
  const [filter, setFilter] = React.useState<Filter>("all");
  const [query, setQuery] = React.useState("");

  const showMatrix = filter !== "unmatched";
  const showExpected = filter === "all";

  const attendedSpec: CellSpec = {
    cell: data.signedUp.attended,
    label: "attended",
    note: "as signed up",
    cols: 3,
  };
  const benchedSpec: CellSpec = {
    cell: data.signedUp.benched,
    label: "benched",
    note: "as signed up",
    cols: 1,
  };
  const noShowSpec: CellSpec = {
    cell: data.signedUp.noShow,
    label: "no-show",
    note: "exception",
    cols: 1,
  };
  const notSignedUpAttendedSpec: CellSpec = {
    cell: data.notSignedUp.attended,
    label: "attended",
    note: "exception",
    cols: 3,
  };
  const notSignedUpBenchedSpec: CellSpec = {
    cell: data.notSignedUp.benched,
    label: "benched",
    note: "exception",
    cols: 1,
  };
  const emptySpec: CellSpec = {
    cell: { count: 0, members: [] },
    label: "—",
    note: "",
    cols: 1,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Summary card */}
      <div className="panel-surface rounded-2xl border border-border/70 px-[18px] py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2.5">
          <div className={EYEBROW_CLASSNAME}>0h snapshot vs attendance record</div>
          <div className="font-mono text-[11px] text-muted-foreground">
            captured {formatEasternDateTime(data.capturedAt, "EEE h:mm a")}
            {data.eventUrl ? (
              <>
                {" · "}
                <a
                  href={data.eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
                >
                  Raid Helper event
                  <ExternalLink className="h-3 w-3" />
                </a>
              </>
            ) : null}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2.5">
          <StatBlock value={data.signedUpAtZeroHour} label="signed up at 0h" />
          <div className="h-4 w-px bg-border" />
          <StatBlock value={data.attendedCount} label="attended" colorClassName="text-primary" />
          <StatBlock value={data.benchedCount} label="benched" />
          <StatBlock
            value={data.exceptionsCount}
            label="exceptions"
            colorClassName="text-destructive"
          />

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <FilterPill
              active={filter === "all"}
              label="All"
              count={data.allCount}
              onClick={() => setFilter("all")}
            />
            <FilterPill
              active={filter === "exceptions"}
              label="Exceptions"
              count={data.exceptionsCount}
              onClick={() => setFilter("exceptions")}
            />
            <FilterPill
              active={filter === "unmatched"}
              label="Unmatched"
              count={data.unmatchedCount}
              onClick={() => setFilter("unmatched")}
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search character…"
              className="min-w-[150px] rounded-lg border border-border/80 bg-background/60 px-3 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      {/* Matrix */}
      {showMatrix ? (
        <div className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-[118px_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="hidden min-[900px]:block" />
          <div className={cn(EYEBROW_CLASSNAME, "hidden pb-0.5 text-center min-[900px]:block")}>
            Attended
          </div>
          <div className={cn(EYEBROW_CLASSNAME, "hidden pb-0.5 text-center min-[900px]:block")}>
            Benched
          </div>
          <div className={cn(EYEBROW_CLASSNAME, "hidden pb-0.5 text-center min-[900px]:block")}>
            Neither
          </div>

          <div className="flex min-[900px]:flex-col min-[900px]:justify-center items-baseline gap-2 min-[900px]:gap-1">
            <div className={EYEBROW_CLASSNAME}>Signed up</div>
            <div className="font-display text-xl font-extrabold leading-tight">
              {data.signedUp.total}
            </div>
          </div>
          {showExpected ? (
            <MatrixCell spec={attendedSpec} query={query} dashed={false} />
          ) : (
            <div className="hidden min-[900px]:block" />
          )}
          {showExpected ? (
            <MatrixCell spec={benchedSpec} query={query} dashed={false} />
          ) : (
            <div className="hidden min-[900px]:block" />
          )}
          <MatrixCell spec={noShowSpec} query={query} dashed={false} />

          <div className="flex min-[900px]:flex-col min-[900px]:justify-center items-baseline gap-2 min-[900px]:gap-1">
            <div className={EYEBROW_CLASSNAME}>Not signed up</div>
            <div className="font-display text-xl font-extrabold leading-tight">
              {data.notSignedUp.total}
            </div>
          </div>
          <MatrixCell spec={notSignedUpAttendedSpec} query={query} dashed={true} />
          <MatrixCell spec={notSignedUpBenchedSpec} query={query} dashed={true} />
          {showExpected ? (
            <MatrixCell spec={emptySpec} query={query} dashed={true} />
          ) : (
            <div className="hidden min-[900px]:block" />
          )}
        </div>
      ) : null}

      {/* Unmatched signups */}
      <div className="rounded-2xl border border-dashed border-border/70 bg-gradient-to-b from-secondary/40 to-card/80 px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className={EYEBROW_CLASSNAME}>Unmatched signups</span>
          <span className="font-display text-sm font-extrabold text-muted-foreground">
            {data.unmatched.length}
          </span>
          <span className="ml-auto font-mono text-[10px] text-muted-foreground">
            outside the matrix — no Temple-Era character resolved
          </span>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-2">
          {data.unmatched
            .filter((m) => matchesQuery(m.name, query))
            .map((m) => (
              <MemberRow key={m.name} member={m} />
            ))}
          {data.unmatched.length === 0 ? (
            <span className="text-[13px] text-muted-foreground">No unmatched signups.</span>
          ) : null}
        </div>
      </div>

      <div className="px-0.5 text-xs leading-[1.6] text-muted-foreground">
        Signups come from the raid&apos;s final pre-raid checkpoint (0h) and are matched to
        characters the same way the signups API matches them; attendance is taken from this
        raid&apos;s WCL logs and bench list. Alts resolve to their primary character.
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="panel-surface flex flex-col gap-3 rounded-2xl border border-border/70 p-5">
        <div className="h-4 w-64 animate-pulse rounded bg-secondary/60" />
        <div className="flex gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 w-20 animate-pulse rounded bg-secondary/60" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2.5 min-[900px]:grid-cols-[118px_minmax(0,2.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-secondary/40" />
        ))}
      </div>
    </div>
  );
}

interface SignupAttendanceComparisonTabProps {
  raidId: number;
  enabled: boolean;
}

/**
 * TEMPLE-98. Same empty-state posture as the Signup Timeline tab (no retry affordance, no
 * toast — a missing link or an uncaptured 0h checkpoint are expected, not errors).
 */
export function SignupAttendanceComparisonTab({
  raidId,
  enabled,
}: SignupAttendanceComparisonTabProps) {
  const { data, isLoading } = api.raidSignupLink.comparisonForRaid.useQuery(
    { raidId },
    { enabled },
  );

  if (!enabled) return null;

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!data || !data.available) {
    return (
      <div className="panel-surface rounded-2xl border border-border/70 p-5">
        <div className="py-6 text-center">
          <div className="text-base text-foreground">
            No signup history available for this raid.
          </div>
          <div className="mt-1.5 text-[13px] text-muted-foreground">
            {!data || data.reason === "no-link"
              ? "This raid isn't linked to a Raid Helper event."
              : "Linked to a Raid Helper event, but no 0h checkpoint was ever captured — this raid predates snapshot capture."}
          </div>
        </div>
      </div>
    );
  }

  return <SignupAttendanceComparisonView data={data} />;
}
