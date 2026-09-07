"use client";

import * as React from "react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { ClassIcon } from "~/components/ui/class-icon";
import { CharacterLink } from "~/components/ui/character-link";
import { SignupVsRaidLogCard } from "~/components/raids/signup-vs-raid-log-card";
import type {
  ComparisonCell,
  ComparisonMember,
  SignupAttendanceComparison,
} from "~/server/services/signup-attendance-comparison";

const EYEBROW_CLASSNAME = "font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground";

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
  cols: 1 | 3;
}

function MatrixCell({ spec, dashed }: { spec: CellSpec; dashed: boolean }) {
  const shown = spec.cell.members;
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

function StatTile({
  value,
  label,
  colorClassName,
}: {
  value: number;
  label: string;
  colorClassName?: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-2 py-1.5 text-center">
      <span className={cn("font-display text-[32px] font-extrabold leading-none", colorClassName)}>
        {value}
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function SignupAttendanceComparisonView({
  data,
  raidId,
  canEditSignupLink,
}: {
  data: SignupAttendanceComparison;
  raidId: number;
  canEditSignupLink?: boolean;
}) {
  const attendedSpec: CellSpec = {
    cell: data.signedUp.attended,
    label: "attended",
    cols: 3,
  };
  const benchedSpec: CellSpec = {
    cell: data.signedUp.benched,
    label: "benched",
    cols: 1,
  };
  const noShowSpec: CellSpec = {
    cell: data.signedUp.noShow,
    label: "no-show",
    cols: 1,
  };
  const notSignedUpAttendedSpec: CellSpec = {
    cell: data.notSignedUp.attended,
    label: "attended",
    cols: 3,
  };
  const notSignedUpBenchedSpec: CellSpec = {
    cell: data.notSignedUp.benched,
    label: "benched",
    cols: 1,
  };
  const emptySpec: CellSpec = {
    cell: { count: 0, members: [] },
    label: "—",
    cols: 1,
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header: summary stats (left/main) + raid log vs. signup (right) */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div className="panel-surface flex min-w-0 flex-1 items-stretch divide-x divide-border rounded-2xl border border-border/70 px-2">
          <StatTile value={data.signedUpAtZeroHour} label="signed up at start (0h)" />
          <StatTile value={data.attendedCount} label="attended" colorClassName="text-primary" />
          <StatTile value={data.benchedCount} label="benched" />
        </div>
        <div className="min-w-0 flex-1">
          <SignupVsRaidLogCard raidId={raidId} canEdit={canEditSignupLink} layout="side-by-side" />
        </div>
      </div>

      {/* Matrix */}
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
        <MatrixCell spec={attendedSpec} dashed={false} />
        <MatrixCell spec={benchedSpec} dashed={false} />
        <MatrixCell spec={noShowSpec} dashed={false} />

        <div className="flex min-[900px]:flex-col min-[900px]:justify-center items-baseline gap-2 min-[900px]:gap-1">
          <div className={EYEBROW_CLASSNAME}>Not signed up</div>
          <div className="font-display text-xl font-extrabold leading-tight">
            {data.notSignedUp.total}
          </div>
        </div>
        <MatrixCell spec={notSignedUpAttendedSpec} dashed={true} />
        <MatrixCell spec={notSignedUpBenchedSpec} dashed={true} />
        <MatrixCell spec={emptySpec} dashed={true} />
      </div>

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
          {data.unmatched.map((m) => (
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
  /** Passed straight through to SignupVsRaidLogCard's edit affordance — same
   * RAIDPLAN_MANAGE gate as the page header's signup-link control. */
  canEditSignupLink?: boolean;
}

/**
 * TEMPLE-98. Same empty-state posture as the Signup Timeline tab (no retry affordance, no
 * toast — a missing link or an uncaptured 0h checkpoint are expected, not errors).
 */
export function SignupAttendanceComparisonTab({
  raidId,
  enabled,
  canEditSignupLink,
}: SignupAttendanceComparisonTabProps) {
  const { data, isLoading, isError } = api.raidSignupLink.comparisonForRaid.useQuery(
    { raidId },
    { enabled },
  );

  if (!enabled) return null;

  // The success case hands off entirely to the view, which places
  // SignupVsRaidLogCard as the right column of its own two-column header — it only
  // makes sense paired with the summary stats that live there. Every other state (loading,
  // error, no data) has no such header to pair with, so the card stays stacked above a
  // full-width message instead.
  if (!isLoading && !isError && data?.available) {
    return (
      <SignupAttendanceComparisonView
        data={data}
        raidId={raidId}
        canEditSignupLink={canEditSignupLink}
      />
    );
  }

  let message: React.ReactNode;
  if (isLoading) {
    message = <LoadingSkeleton />;
  } else if (isError || !data) {
    // A genuine fetch failure (network/tRPC error) leaves `data` undefined too, but
    // that's not the same "expected, no backfill" case as a missing link/checkpoint —
    // don't tell a manager the raid isn't linked when the real problem is the request
    // itself failing.
    message = (
      <div className="panel-surface rounded-2xl border border-border/70 p-5">
        <div className="py-6 text-center">
          <div className="text-base text-foreground">Couldn&apos;t load the signup comparison.</div>
          <div className="mt-1.5 text-[13px] text-muted-foreground">
            Something went wrong fetching this data — try refreshing the page.
          </div>
        </div>
      </div>
    );
  } else if (!data.available) {
    message = (
      <div className="panel-surface rounded-2xl border border-border/70 p-5">
        <div className="py-6 text-center">
          <div className="text-base text-foreground">
            No signup history available for this raid.
          </div>
          <div className="mt-1.5 text-[13px] text-muted-foreground">
            {data.reason === "no-link"
              ? "This raid isn't linked to a Raid Helper event."
              : "Linked to a Raid Helper event, but no 0h checkpoint was ever captured — this raid predates snapshot capture."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <SignupVsRaidLogCard raidId={raidId} canEdit={canEditSignupLink} />
      {message}
    </div>
  );
}
