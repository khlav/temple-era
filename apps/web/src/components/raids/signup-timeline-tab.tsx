"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeftRight, ArrowUp, UserX } from "lucide-react";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { ClassIcon } from "~/components/ui/class-icon";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { RAIDHELPER_STATUS_ICONS } from "~/components/raid-planner/constants";
import { ABSENT_SIGNUP_CLASS_NAMES } from "~/lib/raid-signup-status";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import {
  buildChangeLog,
  buildTimeline,
  checkpointTickLabel,
  classifySignupBucket,
  computeCheckpointDelta,
  computeSignupStates,
  findPreviousCapturedIndex,
  groupByBucket,
  groupByRole,
  maxTimelineBarTotal,
  resolveSignupClass,
  TIMELINE_ROLE_ORDER,
  type ChangeLogKind,
  type ChangeLogRow,
  type RoleGroupMember,
  type SignupChangeState,
  type TimelineSignupEntry,
  type TimelineSlot,
} from "~/lib/signup-timeline";

const LOG_KINDS: ChangeLogKind[] = ["New", "Moved", "Class switch", "Left"];

// Held dots use CLASS_COLORS' rgba string directly at a slightly higher alpha (.34 vs the
// constant's .28) for legibility at 11px — see the design handoff's "Held-dot alpha" note.
const CLASS_HEX: Record<string, string> = {
  Druid: "#FF7C0A",
  Hunter: "#ABD473",
  Mage: "#69CCF0",
  Paladin: "#F58CBA",
  Priest: "#FFFFFF",
  Rogue: "#FFF569",
  Shaman: "#0070DE",
  Warlock: "#9482C9",
  Warrior: "#C79C6E",
};
const CLASS_RGB: Record<string, string> = {
  Druid: "255,124,10",
  Hunter: "171,212,115",
  Mage: "105,204,240",
  Paladin: "245,140,186",
  Priest: "255,255,255",
  Rogue: "255,245,105",
  Shaman: "0,112,222",
  Warlock: "148,130,201",
  Warrior: "198,155,109",
};

function stateNameClass(state: SignupChangeState): string {
  switch (state) {
    case "new":
      return "";
    case "moved":
    case "classSwitch":
      return "text-primary";
    case "gone":
      return "text-muted-foreground line-through opacity-80";
    default:
      return "text-foreground";
  }
}

/** The origin-specific icon for a move/switch chip — a real class shows that class's own
 * icon; a non-class status (Bench/Tentative/Late reuse their own status icon, Absence/
 * Absent gets a dedicated one) shows its status icon. Lets the icon itself say where
 * someone came from without needing the tooltip. */
function OriginIcon({ fromClassName }: { fromClassName: string }) {
  if (classifySignupBucket(fromClassName) === "confirmed") {
    return (
      <ClassIcon
        characterClass={fromClassName.toLowerCase()}
        px={12}
        className="rounded-[3px] opacity-75"
      />
    );
  }
  const StatusIcon = ABSENT_SIGNUP_CLASS_NAMES.has(fromClassName)
    ? UserX
    : RAIDHELPER_STATUS_ICONS[fromClassName];
  return StatusIcon ? <StatusIcon className="h-3 w-3" /> : null;
}

/**
 * The direction + origin icon pair for a moved/classSwitch entry — no tooltip of its own.
 * The direction arrow encodes the transition *type*, the paired OriginIcon encodes *what
 * it was*:
 * - joined a real class from a non-class status (Bench/Tentative/Late/Absence) -> up arrow
 * - left a real class for a non-class status -> down arrow
 * - switched between two real classes, or between two non-class statuses -> the
 *   left-then-right double arrow (not a single bidirectional glyph)
 * The whole entry (icon + name + this) is the tooltip's hit area — see EntryTooltip.
 */
function transitionIcon(member: RoleGroupMember): React.ReactNode {
  if (member.state === "classSwitch" && member.from) {
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 text-primary">
        <ArrowLeftRight className="h-3 w-3" />
        <OriginIcon fromClassName={member.from.className} />
      </span>
    );
  }
  if (member.state === "moved" && member.from) {
    const fromBucket = classifySignupBucket(member.from.className);
    const toBucket = classifySignupBucket(member.signup.className);
    const Direction =
      fromBucket !== "confirmed" && toBucket === "confirmed"
        ? ArrowUp
        : fromBucket === "confirmed" && toBucket !== "confirmed"
          ? ArrowDown
          : ArrowLeftRight;
    return (
      <span className="inline-flex shrink-0 items-center gap-0.5 text-primary">
        <Direction className="h-3 w-3" />
        <OriginIcon fromClassName={member.from.className} />
      </span>
    );
  }
  return null;
}

/** Tooltip text explaining a member's change — null (no tooltip) for a held member, or a
 * fresh arrival with no prior state worth naming. */
function memberTooltipText(member: RoleGroupMember): string | null {
  if (member.ghost) return member.to ? `…to ${member.to.className}` : "Left the event";
  if ((member.state === "moved" || member.state === "classSwitch") && member.from) {
    return `…from ${member.from.className}`;
  }
  return null;
}

/** The tooltip's hitbox is the whole entry (icon, name, and transition chip together),
 * not just the small chip icon — easier to hover, and the detail is relevant to the
 * whole row, not just the chip. */
function EntryTooltip({
  member,
  children,
}: {
  member: RoleGroupMember;
  children: React.ReactElement;
}) {
  const text = memberTooltipText(member);
  if (!text) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="bg-secondary text-muted-foreground">{text}</TooltipContent>
    </Tooltip>
  );
}

function ClassIconWithState({ className, state }: { className: string; state: SignupChangeState }) {
  const hex = CLASS_HEX[className];
  const style =
    state === "new" && hex
      ? { boxShadow: `0 0 0 1.5px ${hex}` }
      : state === "moved" || state === "classSwitch"
        ? { boxShadow: "0 0 0 1.5px hsl(var(--primary))" }
        : state === "gone" && hex
          ? { opacity: 0.4, outline: `1.5px dashed ${hex}`, outlineOffset: 1 }
          : { opacity: 0.78 };
  return (
    <ClassIcon
      characterClass={className.toLowerCase()}
      px={14}
      className="shrink-0 rounded-[4px]"
      // eslint-disable-next-line react/forbid-dom-props -- per-signup state ring color
      // is only known at render time (class hue or primary), not expressible as a
      // static Tailwind class.
      style={style}
    />
  );
}

function SignupName({ member }: { member: RoleGroupMember }) {
  const resolvedClass = resolveSignupClass(member.signup) ?? "Warrior";
  return (
    <EntryTooltip member={member}>
      <span className={cn("flex items-center gap-1.5 text-[13px]", stateNameClass(member.state))}>
        <ClassIconWithState className={resolvedClass} state={member.state} />
        <span style={member.state === "new" ? { color: CLASS_HEX[resolvedClass] } : undefined}>
          {member.signup.name}
        </span>
        {transitionIcon(member)}
      </span>
    </EntryTooltip>
  );
}

/** Bench/Tentative names show a status icon (Armchair/CircleHelp/Clock), not a class icon —
 * className here is literally "Bench"/"Tentative"/"Late", and specName alone can't
 * disambiguate a shared spec name across classes (e.g. Warrior vs Paladin "Protection")
 * without guessing. Matches the existing convention in character-card.tsx /
 * find-gamers-dialog.tsx. */
function StatusName({ member }: { member: RoleGroupMember }) {
  const StatusIcon = RAIDHELPER_STATUS_ICONS[member.signup.className];
  return (
    <EntryTooltip member={member}>
      <span className={cn("flex items-center gap-1.5 text-[13px]", stateNameClass(member.state))}>
        {StatusIcon ? <StatusIcon className="h-3.5 w-3.5 shrink-0 opacity-70" /> : null}
        <span>{member.signup.name}</span>
        {transitionIcon(member)}
      </span>
    </EntryTooltip>
  );
}

function dotStyle(className: string, state: SignupChangeState): React.CSSProperties {
  const hex = CLASS_HEX[className] ?? "#8a8a8a";
  const rgb = CLASS_RGB[className] ?? "138,138,138";
  if (state === "new") return { background: hex };
  if (state === "gone")
    return { border: `1.5px dashed ${hex}`, boxSizing: "border-box", opacity: 0.75 };
  if (state === "moved" || state === "classSwitch")
    return {
      background: `linear-gradient(45deg, hsl(var(--foreground) / .12) 0 48%, ${hex} 52% 100%)`,
    };
  return { background: `rgba(${rgb},.34)` };
}

function DeltaText({
  current,
  previous,
  suffix,
}: {
  current: number;
  previous: number | null;
  suffix?: string;
}) {
  if (previous === null)
    return <span className="text-muted-foreground">{suffix ? "no change" : "—"}</span>;
  const d = current - previous;
  if (d === 0)
    return (
      <span className="text-muted-foreground">
        no change
        {suffix ? <span className="block">{suffix}</span> : null}
      </span>
    );
  return (
    <span className={d > 0 ? "text-chart-2" : "text-destructive"}>
      {d > 0 ? `+${d}` : d}
      {suffix ? <span className="block">{suffix}</span> : null}
    </span>
  );
}

interface SignupTimelineTabProps {
  raidId: number;
  enabled: boolean;
}

/**
 * Raid-specific data-fetching wrapper around SignupTimelineView. Resolves a completed
 * raid's linked occurrence via timelineForRaid (raidId -> raid_signup_snapshot_link),
 * then hands the resulting slots to the (raid-agnostic) view.
 *
 * The view itself only knows about TimelineSlot[], not raidId — a future raid-manager
 * "watch signups as they happen" screen for an *upcoming* event (no `raids` row yet,
 * per TEMPLE-97 follow-up discussion) can reuse SignupTimelineView directly behind a
 * different wrapper keyed on (raidHelperEventId, startTime) instead of raidId, e.g. via
 * getSignupSnapshotHistoryForOccurrence directly (already occurrence-keyed, not
 * raid-keyed) rather than through raidSignupLinkRouter.
 */
export function SignupTimelineTab({ raidId, enabled }: SignupTimelineTabProps) {
  const timelineQuery = api.raidSignupLink.timelineForRaid.useQuery({ raidId }, { enabled });
  const link = timelineQuery.data?.link ?? null;

  const liveQuery = api.raidHelper.getEventDetails.useQuery(
    { eventId: link?.raidHelperEventId ?? "" },
    { enabled: !!link, retry: false },
  );
  const live: TimelineSignupEntry[] | null = liveQuery.data
    ? [...liveQuery.data.signups.assigned, ...liveQuery.data.signups.unassigned]
    : null;

  const slots = useMemo(
    () => buildTimeline(timelineQuery.data?.snapshots ?? [], live),
    // liveQuery.data is the real dependency; `live` is derived fresh each render.
    [timelineQuery.data?.snapshots, liveQuery.data],
  );

  if (!enabled) return null;

  return (
    <SignupTimelineView
      slots={slots}
      hasLink={!!link}
      loading={timelineQuery.isLoading || (!!link && liveQuery.isLoading)}
      noHistoryDetail="This raid isn't linked to a Raid Helper event."
    />
  );
}

interface SignupTimelineViewProps {
  slots: TimelineSlot[];
  hasLink: boolean;
  loading: boolean;
  /** Shown in the empty state when hasLink is false — differs by caller (a completed
   * raid vs. e.g. a not-yet-matched upcoming event). */
  noHistoryDetail: string;
}

export function SignupTimelineView({
  slots,
  hasLink,
  loading,
  noHistoryDetail,
}: SignupTimelineViewProps) {
  // `manualSelected` is null until the user clicks a row — until then, `selected` tracks
  // whichever slot is currently the latest displayable one (captured or live), so a raid
  // whose 0h slot never captured and whose live fetch failed doesn't default to an empty
  // checkpoint. Once the user picks a row, that choice sticks (rows are only clickable
  // when displayable, so manualSelected is always valid once set).
  const [manualSelected, setManualSelected] = useState<number | null>(null);
  const [changesOnly, setChangesOnly] = useState(false);
  const [logFilter, setLogFilter] = useState<"All" | ChangeLogKind>("All");

  const latestDisplayableIndex = useMemo(() => {
    for (let i = slots.length - 1; i >= 0; i--) {
      if (slots[i]?.captured || slots[i]?.isLive) return i;
    }
    return 6;
  }, [slots]);
  const selected =
    manualSelected !== null && (slots[manualSelected]?.captured || slots[manualSelected]?.isLive)
      ? manualSelected
      : latestDisplayableIndex;

  const selectedSlot = slots[selected]!;
  const prevIndex = findPreviousCapturedIndex(slots, selected);
  const prevSlot = prevIndex === null ? null : slots[prevIndex]!;
  const states = useMemo(
    () => computeSignupStates(prevSlot?.signups ?? [], selectedSlot.signups),
    [prevSlot, selectedSlot],
  );
  const maxBarTotal = useMemo(() => maxTimelineBarTotal(slots), [slots]);

  const roleGroups = useMemo(
    () => groupByRole(selectedSlot.signups, states),
    [selectedSlot, states],
  );
  const prevRoleCounts = useMemo(() => {
    if (!prevSlot) return null;
    const groups = groupByRole(prevSlot.signups, new Map());
    return new Map(groups.map((g) => [g.role, g.members.length]));
  }, [prevSlot]);

  const benchMembers = useMemo(
    () => groupByBucket(selectedSlot.signups, "bench", states),
    [selectedSlot, states],
  );
  const tentativeMembers = useMemo(
    () => groupByBucket(selectedSlot.signups, "tentative", states),
    [selectedSlot, states],
  );
  const absentMembers = useMemo(
    () => groupByBucket(selectedSlot.signups, "absent", states),
    [selectedSlot, states],
  );

  const changeLog = useMemo(() => buildChangeLog(slots), [slots]);
  const logCounts = useMemo(() => {
    const counts: Record<"All" | ChangeLogKind, number> = {
      All: changeLog.length,
      New: 0,
      Moved: 0,
      "Class switch": 0,
      Left: 0,
    };
    for (const row of changeLog) counts[row.kind]++;
    return counts;
  }, [changeLog]);
  const filteredLog = useMemo(
    () => (logFilter === "All" ? changeLog : changeLog.filter((r) => r.kind === logFilter)),
    [changeLog, logFilter],
  );
  const logGroups = useMemo(() => {
    const groups: Array<{ checkpoint: string; capturedAt: Date | null; rows: ChangeLogRow[] }> = [];
    for (const row of filteredLog) {
      const last = groups[groups.length - 1];
      if (last && last.checkpoint === row.checkpoint) {
        last.rows.push(row);
      } else {
        const slot = slots.find((s) => s.checkpoint === row.checkpoint);
        groups.push({
          checkpoint: row.checkpoint,
          capturedAt: slot?.capturedAt ?? null,
          rows: [row],
        });
      }
    }
    return groups;
  }, [filteredLog, slots]);

  if (loading) {
    return (
      <div className="panel-surface flex flex-col gap-3 rounded-2xl border border-border/70 p-5">
        <div className="flex gap-1 [&>div]:h-[68px] [&>div]:flex-1 [&>div]:animate-pulse [&>div]:rounded [&>div]:bg-secondary/60">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} />
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground">Loading signup history…</p>
      </div>
    );
  }

  const hasHistory = slots.some((s) => s.captured || s.isLive);

  if (!hasLink || !hasHistory) {
    return (
      <div className="panel-surface rounded-2xl border border-border/70 p-5">
        {hasLink ? (
          <div className="mb-4 flex gap-1">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-[68px] flex-1 rounded border-[1.5px] border-dashed border-border"
              />
            ))}
          </div>
        ) : null}
        <div className="py-6 text-center">
          <div className="text-base text-foreground">
            No signup history available for this raid.
          </div>
          <div className="mt-1.5 text-[13px] text-muted-foreground">
            {hasLink
              ? "Linked to a Raid Helper event, but no checkpoint was ever captured — this raid predates snapshot capture."
              : noHistoryDetail}
          </div>
        </div>
      </div>
    );
  }

  const orderedIndices = [6, 5, 4, 3, 2, 1, 0]; // latest first

  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="order-2 flex w-[352px] max-w-full flex-none flex-col gap-3">
        {/* Checkpoint panel */}
        <div className="panel-surface rounded-2xl border border-border/70 px-[18px] py-4">
          <div className="flex items-baseline justify-between gap-2.5">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Captured checkpoints
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              latest first · click a row to select it
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-0.5">
            {orderedIndices.map((i) => {
              const slot = slots[i]!;
              const isSelected = i === selected;
              const displayable = slot.captured || slot.isLive;
              const label = checkpointTickLabel(slot.checkpoint, slot.isLive);
              const rowDelta = displayable ? computeCheckpointDelta(slots, i) : null;
              const total = displayable ? `${slot.counts.confirmed}(+${slot.counts.bench})` : "—";
              return (
                <button
                  key={slot.checkpoint}
                  type="button"
                  disabled={!displayable}
                  onClick={() => setManualSelected(i)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-[10px] border px-2.5 py-[7px]",
                    displayable ? "cursor-pointer" : "cursor-default",
                    isSelected ? "border-primary/45 bg-primary/10" : "border-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "w-12 shrink-0 text-left font-mono text-[11px] whitespace-nowrap",
                      isSelected || slot.isLive
                        ? "text-primary"
                        : displayable
                          ? "text-muted-foreground"
                          : "text-muted-foreground/50",
                      slot.isLive && "italic",
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      "flex h-3.5 flex-1 overflow-hidden rounded",
                      displayable
                        ? isSelected
                          ? "outline outline-2 outline-offset-2 outline-primary"
                          : "opacity-50"
                        : "box-border border-[1.5px] border-dashed border-border",
                    )}
                  >
                    {displayable ? (
                      <>
                        <span
                          className="h-full flex-none"
                          style={{
                            width: `${(slot.counts.confirmed / maxBarTotal) * 100}%`,
                            background: isSelected
                              ? "hsl(var(--primary))"
                              : "hsl(var(--foreground) / .72)",
                          }}
                        />
                        <span
                          className="h-full flex-none"
                          style={{
                            width: `${(slot.counts.bench / maxBarTotal) * 100}%`,
                            backgroundImage: `repeating-linear-gradient(45deg, ${
                              isSelected
                                ? "hsl(var(--primary) / .8)"
                                : "hsl(var(--foreground) / .72)"
                            } 0 2px, transparent 2px 4px)`,
                          }}
                        />
                        <span
                          className="h-full flex-none"
                          style={{
                            width: `${(slot.counts.absent / maxBarTotal) * 100}%`,
                            background: "hsl(var(--foreground) / .16)",
                          }}
                        />
                      </>
                    ) : null}
                  </span>
                  <span
                    className="w-14 shrink-0 text-right font-mono text-[13px] font-bold"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    <span
                      className={
                        isSelected
                          ? "text-primary"
                          : displayable
                            ? "text-foreground"
                            : "text-muted-foreground/50"
                      }
                    >
                      {total}
                    </span>
                  </span>
                  <span className="flex w-[66px] shrink-0 flex-col items-end gap-px font-mono text-[10px] leading-tight">
                    {!displayable ? (
                      <span>&nbsp;</span>
                    ) : rowDelta === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <>
                        <span className="text-chart-2">
                          {rowDelta.confirmedGain > 0
                            ? `+${rowDelta.confirmedGain}${rowDelta.benchGain > 0 ? `(+${rowDelta.benchGain})` : ""}`
                            : rowDelta.benchGain > 0
                              ? `(+${rowDelta.benchGain})`
                              : "—"}
                        </span>
                        <span className="text-destructive">
                          {rowDelta.confirmedLoss > 0 ? `−${rowDelta.confirmedLoss}` : ""}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2.5 text-[13px] text-muted-foreground">
            <span>
              {checkpointTickLabel(selectedSlot.checkpoint, selectedSlot.isLive)}
              {selectedSlot.isLive
                ? " · live from Raid Helper"
                : ` · captured ${
                    selectedSlot.capturedAt
                      ? formatEasternDateTime(selectedSlot.capturedAt, "EEE h:mm a")
                      : "—"
                  }`}
              {" · "}
              {selectedSlot.counts.confirmed}(+{selectedSlot.counts.bench}) signups ·{" "}
              {selectedSlot.counts.tentative} tentative · {selectedSlot.counts.absent} absent
              {prevIndex === null
                ? " · first capture"
                : ` · compared with ${checkpointTickLabel(slots[prevIndex]!.checkpoint, false)}`}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(changesOnly && "border-primary/50 bg-primary/14 text-primary")}
              onClick={() => setChangesOnly((v) => !v)}
            >
              show changes only
            </Button>
          </div>
        </div>

        {/* Inline change log */}
        <div className="panel-surface rounded-2xl border border-border/70 p-3.5">
          <div className="mb-2.5 flex items-baseline justify-between gap-2.5">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Change log
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              {logCounts.All} changes · newest first
            </div>
          </div>
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {(["All", ...LOG_KINDS] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setLogFilter(kind)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 font-mono text-[11px]",
                  logFilter === kind
                    ? "border-primary/50 bg-primary/14 text-primary"
                    : "border-border/90 bg-secondary/60 text-muted-foreground",
                )}
              >
                {kind} {logCounts[kind]}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-border/70">
            {logGroups.length === 0 ? (
              <div className="px-3.5 py-6 text-center text-sm text-muted-foreground">
                No changes match this filter.
              </div>
            ) : (
              logGroups.map((group, gi) => (
                <div key={`${group.checkpoint}-${gi}`}>
                  <div
                    className={cn(
                      "flex items-baseline gap-2.5 bg-secondary/55 px-3.5 py-2 border-b border-border/70",
                      gi > 0 && "border-t",
                    )}
                  >
                    <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-foreground">
                      {checkpointTickLabel(group.checkpoint as never, false)}
                    </span>
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                      {group.rows.length} {group.rows.length === 1 ? "change" : "changes"}
                    </span>
                  </div>
                  {group.rows.map((row, ri) => (
                    <ChangeLogRowView key={`${row.signup.userId}-${row.kind}-${ri}`} row={row} />
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="order-1 flex min-w-0 flex-1 basis-[560px] flex-col gap-3">
        {/* Role breakdown */}
        <div className="panel-surface overflow-hidden rounded-2xl border border-border/70">
          {TIMELINE_ROLE_ORDER.map((role, ri) => {
            const group = roleGroups.find((g) => g.role === role)!;
            const shown = changesOnly
              ? group.byClass
                  .map((c) => ({ ...c, members: c.members.filter((m) => m.state !== "held") }))
                  .filter((c) => c.members.length > 0)
              : group.byClass;
            const prevCount = prevRoleCounts?.get(role) ?? null;
            return (
              <div
                key={role}
                className={cn(
                  "flex gap-3.5 px-4 py-3",
                  ri < TIMELINE_ROLE_ORDER.length - 1 && "border-b border-border/50",
                )}
              >
                <div className="w-20 flex-none">
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    {role}
                  </div>
                  <div className="font-display mt-0.5 text-[22px] font-bold leading-tight">
                    {group.members.length}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px]">
                    {prevIndex === null ? (
                      <span className="text-muted-foreground">no change</span>
                    ) : (
                      <DeltaText
                        current={group.members.length}
                        previous={prevCount}
                        suffix={`vs ${checkpointTickLabel(slots[prevIndex]!.checkpoint, false)}`}
                      />
                    )}
                  </div>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-0.5">
                  {shown.length === 0 ? (
                    <div className="py-0.5 text-[13px] text-muted-foreground">
                      {changesOnly ? "No changes at this checkpoint." : "No signups in this role."}
                    </div>
                  ) : (
                    shown.map((g) => (
                      <div key={g.className} className="flex items-start gap-2.5">
                        <ClassIcon
                          characterClass={g.className.toLowerCase()}
                          px={18}
                          className="mt-px shrink-0 rounded-[4px] opacity-90"
                        />
                        <span className="font-display w-5 flex-none text-right text-[13px] font-bold leading-[18px]">
                          {g.members.filter((m) => !m.ghost).length}
                        </span>
                        <span className="grid flex-none grid-cols-[repeat(5,11px)] gap-x-[5px] gap-y-1 pt-[3px]">
                          {g.members.map((m) => (
                            <span
                              key={m.signup.userId}
                              className="h-[11px] w-[11px] flex-none rounded-[2px]"
                              style={dotStyle(g.className, m.state)}
                            />
                          ))}
                        </span>
                        <span className="ml-2.5 flex min-w-0 flex-1 flex-wrap gap-x-2.5 gap-y-1">
                          {g.members.map((m) => (
                            <SignupName key={m.signup.userId} member={m} />
                          ))}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bench / Tentative */}
        <div className="flex flex-wrap gap-3">
          <BucketCard
            label="Bench"
            members={benchMembers}
            prevCount={prevSlot?.counts.bench ?? null}
            changesOnly={changesOnly}
          />
          <BucketCard
            label="Tentative / Late"
            members={tentativeMembers}
            prevCount={prevSlot?.counts.tentative ?? null}
            changesOnly={changesOnly}
          />
        </div>

        {/* Absent */}
        <div className="panel-surface rounded-2xl border border-dashed border-border/70 px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2.5">
            <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              Absent
            </div>
            <div className="font-mono text-[11px] text-muted-foreground">
              {selectedSlot.counts.absent} ·{" "}
              {prevSlot === null ? (
                "—"
              ) : (
                <DeltaText current={selectedSlot.counts.absent} previous={prevSlot.counts.absent} />
              )}
            </div>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-2">
            {(changesOnly ? absentMembers.filter((m) => m.state !== "held") : absentMembers).map(
              (m) => (
                <EntryTooltip key={m.signup.userId} member={m}>
                  <span className={cn("text-[13px]", stateNameClass(m.state))}>
                    {m.signup.name}
                    {transitionIcon(m)}
                  </span>
                </EntryTooltip>
              ),
            )}
            {absentMembers.length === 0 ? (
              <span className="text-[13px] text-muted-foreground">
                Nobody absent at this checkpoint.
              </span>
            ) : null}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Class-less — Raid Helper doesn&apos;t require a class on an absence.
          </div>
        </div>

        <div className="px-0.5 text-xs leading-[1.6] text-muted-foreground">
          Names are shown exactly as Raid Helper reports them; no attempt is made to resolve them to
          a Temple-Era character, so a name here may not match the Attendance tab. Dot fill weight
          carries state: soft = held since the previous checkpoint, full class color = joined,
          dashed = left. A dot split top-left to bottom-right is the same person moved — the dimmed
          half is where they came from.
        </div>
      </div>
    </div>
  );
}

function BucketCard({
  label,
  members,
  prevCount,
  changesOnly,
}: {
  label: string;
  members: RoleGroupMember[];
  prevCount: number | null;
  changesOnly: boolean;
}) {
  const shown = changesOnly ? members.filter((m) => m.state !== "held") : members;
  return (
    <div className="panel-surface min-w-[260px] flex-1 rounded-2xl border border-border/70 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-[11px]">
          {members.length} ·{" "}
          {prevCount === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <DeltaText current={members.length} previous={prevCount} />
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2">
        {shown.map((m) => (
          <StatusName key={m.signup.userId} member={m} />
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="mt-0.5 text-[13px] text-muted-foreground">
          Nobody in this bucket at this checkpoint.
        </div>
      ) : null}
    </div>
  );
}

/** Same direction convention as transitionIcon (used in the role breakdown): down = left a
 * real class for a non-class status, up = the inverse, left-right = a lateral switch
 * (class<->class or non-class-status<->non-class-status). */
function changeLogGlyph(row: ChangeLogRow): React.ReactNode {
  if (row.kind === "New") return "+";
  if (row.kind === "Left") return "−";
  if (row.kind === "Class switch") return <ArrowLeftRight className="h-3 w-3" />;
  const fromBucket = row.from ? classifySignupBucket(row.from.className) : null;
  const toBucket = classifySignupBucket(row.signup.className);
  const Icon =
    fromBucket === "confirmed" && toBucket !== "confirmed"
      ? ArrowDown
      : fromBucket !== "confirmed" && toBucket === "confirmed"
        ? ArrowUp
        : ArrowLeftRight;
  return <Icon className="h-3 w-3" />;
}

function ChangeLogRowView({ row }: { row: ChangeLogRow }) {
  const glyphColor =
    row.kind === "New" ? "text-chart-2" : row.kind === "Left" ? "text-destructive" : "text-primary";
  const state: SignupChangeState =
    row.kind === "New"
      ? "new"
      : row.kind === "Left"
        ? "gone"
        : row.kind === "Moved"
          ? "moved"
          : "classSwitch";
  const resolvedClass =
    resolveSignupClass(row.signup) ?? (row.from ? resolveSignupClass(row.from) : null);
  const fromLabel = row.from ? row.from.className : "—";
  const toLabel = row.kind === "Left" ? "—" : row.signup.className;

  return (
    <div className="flex items-center gap-2 border-b border-border/45 px-3 py-2 last:border-b-0">
      <span
        className={cn(
          "flex w-3 flex-none items-center justify-center font-mono text-xs",
          glyphColor,
        )}
      >
        {changeLogGlyph(row)}
      </span>
      {resolvedClass ? (
        <ClassIconWithState className={resolvedClass} state={state} />
      ) : (
        <span className="h-3.5 w-3.5 flex-none" />
      )}
      <span className="min-w-0 flex-1 truncate text-[13px]">{row.signup.name}</span>
      <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
        {fromLabel} → {toLabel}
      </span>
    </div>
  );
}
