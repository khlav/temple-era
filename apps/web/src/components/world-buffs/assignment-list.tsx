"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { formatInTimeZone } from "date-fns-tz";
import { CalendarClock, Check, Pencil, Trash2, Undo2 } from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { WorldBuffCharacterIdentity } from "./world-buff-character-identity";
import { BuffIcon, DragonBuffIcon, WorldBuffIcon } from "./world-buff-icon";
import { NotesIndicator, QUEUE_TYPE_ICON } from "./queue-type-icon";
import { useScheduleDialog } from "./schedule-dialog-context";
import { useSetWorldBuffState } from "./use-world-buff-mutations";
import { SCOPE } from "~/lib/scopes";
import { EASTERN_TIMEZONE, formatEasternDateTime } from "~/lib/raid-formatting";
import {
  computeDefaultScheduledAt,
  hasAssignmentOnSameEasternDate,
  parseEasternDatetimeLocalValue,
  toEasternDatetimeLocalValue,
} from "~/lib/world-buff-schedule-defaults";
import { cn } from "~/lib/utils";
import {
  WORLD_BUFF_BY_ITEM,
  WORLD_BUFFS,
  WORLD_BUFF_LABELS,
  WORLD_BUFF_DEFAULT_TIME_ET,
  type WorldBuff,
  type WorldBuffItem,
} from "~/lib/world-buffs";

const DATE_FORMAT = "M/d/yyyy, h:mm a";
const QUEUE_TYPE_ORDER: Record<"main" | "alt" | "backup", number> = { main: 0, alt: 1, backup: 2 };
// Rend and Dragon share a default drop time (both 7:00pm ET, see WORLD_BUFF_DEFAULT_TIME_ET),
// so an exact day/time tie is routine, not an edge case — this is the tiebreak order raid leads
// actually call turn-ins in.
const WORLD_BUFF_SORT_ORDER: Record<WorldBuff, number> = { zg: 0, dragon: 1, rend: 2 };

type ActiveAssignment = RouterOutputs["worldBuff"]["listActiveAssignments"][number];
type PastAssignment = RouterOutputs["worldBuff"]["listPastAssignments"][number];
type StatusRow = RouterOutputs["worldBuff"]["getAll"][number];

/** Sorts by scheduled time, breaking exact ties by buff (ZG, Dragon, Rend) rather than leaving
 *  same-time rows in whatever order the query happened to return them in. */
function sortAssignments<T extends ActiveAssignment | PastAssignment>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const timeDiff = new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    const buffA = WORLD_BUFF_BY_ITEM[a.status.item as WorldBuffItem];
    const buffB = WORLD_BUFF_BY_ITEM[b.status.item as WorldBuffItem];
    return WORLD_BUFF_SORT_ORDER[buffA] - WORLD_BUFF_SORT_ORDER[buffB];
  });
}

/** Groups rows by Eastern calendar date. Within a group, row order is whatever the caller
 *  passed in (callers pre-sort with `sortAssignments`), even when the groups themselves are
 *  sorted newest-first for the Completed view. */
function groupByEasternDate<T extends { scheduledAt: Date | string }>(
  rows: T[],
  { order = "asc" }: { order?: "asc" | "desc" } = {},
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = formatInTimeZone(new Date(row.scheduledAt), EASTERN_TIMEZONE, "yyyy-MM-dd");
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (order === "asc" ? a.localeCompare(b) : b.localeCompare(a)))
    .map(([dateKey, groupRows]) => ({
      dateKey,
      label: formatInTimeZone(
        new Date(groupRows[0]!.scheduledAt),
        EASTERN_TIMEZONE,
        "EEEE, MMMM do",
      ),
      rows: groupRows,
    }));
}

/** Strips the `assignments` relation off a `getAll` status row so it fits the narrower shape
 *  `listActiveAssignments`/`listPastAssignments` embed on each row's `status` field. */
function withoutAssignments<T extends { assignments: unknown }>(row: T): Omit<T, "assignments"> {
  const { assignments: _assignments, ...rest } = row;
  return rest;
}

function AssignmentRow({
  assignment,
  className,
  action,
  timeOnly = false,
  canManage,
}: {
  assignment: ActiveAssignment | PastAssignment;
  className?: string;
  action: React.ReactNode;
  /** Active rows are grouped under a day header, so the date's redundant here — show just the
   *  time, right-aligned, instead of the full date/time inline with the notes. */
  timeOnly?: boolean;
  canManage: boolean;
}) {
  const dropped = assignment.status.state === "dropped";
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-md border p-2", className)}>
      <WorldBuffIcon
        item={assignment.status.item as WorldBuffItem}
        size={28}
        className="inline-block shrink-0 rounded-sm"
        grayscale={dropped}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <WorldBuffCharacterIdentity
            character={assignment.status}
            showDiscord={canManage}
            dropped={dropped}
          />
        </div>
        {timeOnly ? (
          assignment.notes && (
            <div className="text-xs text-muted-foreground">{assignment.notes}</div>
          )
        ) : (
          <div className="text-xs text-muted-foreground">
            {formatEasternDateTime(new Date(assignment.scheduledAt), DATE_FORMAT)}
            {assignment.notes ? ` · ${assignment.notes}` : ""}
          </div>
        )}
      </div>
      {timeOnly && (
        <div className="shrink-0 text-right text-muted-foreground">
          {formatEasternDateTime(new Date(assignment.scheduledAt), "h:mm a")}
        </div>
      )}
      {action}
    </div>
  );
}

export function AssignmentList() {
  const { data: session } = useSession();
  const canManage = !!session?.user?.scopes?.includes(SCOPE.WORLDBUFF_MANAGE);
  const { toast } = useToast();
  const utils = api.useUtils();

  const [view, setView] = useState<"active" | "past">("active");
  const { data: activeAssignments, isLoading: activeLoading } =
    api.worldBuff.listActiveAssignments.useQuery();
  const { data: pastAssignments, isLoading: pastLoading } =
    api.worldBuff.listPastAssignments.useQuery(undefined, {
      enabled: canManage && view === "past",
    });
  const { data: statuses } = api.worldBuff.getAll.useQuery(undefined, { enabled: canManage });
  const readyStatuses = (statuses ?? []).filter((s) => s.state === "ready_to_drop");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [selectedBuff, setSelectedBuff] = useState<WorldBuff | null>(null);
  const [statusId, setStatusId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  const invalidateAll = async () => {
    await Promise.all([
      utils.worldBuff.listActiveAssignments.invalidate(),
      utils.worldBuff.listPastAssignments.invalidate(),
      utils.worldBuff.getAll.invalidate(),
    ]);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setDialogMode("create");
    setEditingAssignmentId(null);
    setSelectedBuff(null);
    setStatusId("");
    setScheduledAt("");
    setNotes("");
  };

  const createAssignment = api.worldBuff.createAssignment.useMutation({
    onMutate: async (input) => {
      await utils.worldBuff.listActiveAssignments.cancel();
      const prevActive = utils.worldBuff.listActiveAssignments.getData();

      const status = statuses?.find((s) => s.id === input.statusId);
      if (status) {
        const optimistic = {
          id: `optimistic-${crypto.randomUUID()}`,
          statusId: input.statusId,
          scheduledAt: input.scheduledAt as Date,
          notes: input.notes ?? null,
          createdById: session?.user?.id ?? "",
          updatedById: session?.user?.id ?? "",
          createdAt: new Date(),
          updatedAt: new Date(),
          status: withoutAssignments(status),
        };
        utils.worldBuff.listActiveAssignments.setData(undefined, (old) =>
          old
            ? [...old, optimistic].sort(
                (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
              )
            : old,
        );
      }

      return { prevActive };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevActive) utils.worldBuff.listActiveAssignments.setData(undefined, ctx.prevActive);
      toast({ title: "Failed to schedule", description: error.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Assignment scheduled" });
      closeDialog();
    },
    onSettled: () => {
      void invalidateAll();
    },
  });

  const updateAssignment = api.worldBuff.updateAssignment.useMutation({
    onMutate: async (input) => {
      await Promise.all([
        utils.worldBuff.listActiveAssignments.cancel(),
        utils.worldBuff.listPastAssignments.cancel(),
      ]);
      const prevActive = utils.worldBuff.listActiveAssignments.getData();
      const prevPast = utils.worldBuff.listPastAssignments.getData();

      const newStatus = input.statusId ? statuses?.find((s) => s.id === input.statusId) : undefined;
      const newStatusFields = newStatus ? withoutAssignments(newStatus) : undefined;

      const patch = <T extends ActiveAssignment | PastAssignment>(a: T): T =>
        a.id === input.assignmentId
          ? ({
              ...a,
              scheduledAt: (input.scheduledAt as Date | undefined) ?? a.scheduledAt,
              notes: input.notes !== undefined ? input.notes : a.notes,
              status: newStatusFields ?? a.status,
            } as T)
          : a;

      utils.worldBuff.listActiveAssignments.setData(undefined, (old) => old?.map(patch));
      utils.worldBuff.listPastAssignments.setData(undefined, (old) => old?.map(patch));

      return { prevActive, prevPast };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevActive) utils.worldBuff.listActiveAssignments.setData(undefined, ctx.prevActive);
      if (ctx?.prevPast) utils.worldBuff.listPastAssignments.setData(undefined, ctx.prevPast);
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Assignment updated" });
      closeDialog();
    },
    onSettled: () => {
      void invalidateAll();
    },
  });

  const deleteAssignment = api.worldBuff.deleteAssignment.useMutation({
    onMutate: async (input) => {
      await Promise.all([
        utils.worldBuff.listActiveAssignments.cancel(),
        utils.worldBuff.listPastAssignments.cancel(),
      ]);
      const prevActive = utils.worldBuff.listActiveAssignments.getData();
      const prevPast = utils.worldBuff.listPastAssignments.getData();

      utils.worldBuff.listActiveAssignments.setData(undefined, (old) =>
        old?.filter((a) => a.id !== input.assignmentId),
      );
      utils.worldBuff.listPastAssignments.setData(undefined, (old) =>
        old?.filter((a) => a.id !== input.assignmentId),
      );

      return { prevActive, prevPast };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevActive) utils.worldBuff.listActiveAssignments.setData(undefined, ctx.prevActive);
      if (ctx?.prevPast) utils.worldBuff.listPastAssignments.setData(undefined, ctx.prevPast);
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: "Assignment deleted" });
    },
    onSettled: () => {
      void invalidateAll();
    },
  });

  const setWorldBuffState = useSetWorldBuffState();

  const openCreateDialog = () => {
    closeDialog();
    setDialogOpen(true);
  };

  const openEditDialog = (a: ActiveAssignment | PastAssignment) => {
    setDialogMode("edit");
    setEditingAssignmentId(a.id);
    setSelectedBuff(WORLD_BUFF_BY_ITEM[a.status.item as WorldBuffItem]);
    setStatusId(a.status.id);
    setScheduledAt(toEasternDatetimeLocalValue(new Date(a.scheduledAt)));
    setNotes(a.notes ?? "");
    setDialogOpen(true);
  };

  const handleSelectBuff = (buff: WorldBuff) => {
    setSelectedBuff(buff);
    setStatusId("");

    const otherActiveForBuff = (activeAssignments ?? [])
      .filter((a) => a.id !== editingAssignmentId)
      .filter((a) => WORLD_BUFF_BY_ITEM[a.status.item as WorldBuffItem] === buff)
      .map((a) => new Date(a.scheduledAt));

    if (dialogMode === "create") {
      const { hour, minute } = WORLD_BUFF_DEFAULT_TIME_ET[buff];
      setScheduledAt(computeDefaultScheduledAt(hour, minute, otherActiveForBuff));
      return;
    }

    // Editing: keep the day/time as-is when switching buffs — only clear it if that slot now
    // collides with another active assignment already scheduled for the new buff that day.
    if (
      scheduledAt &&
      hasAssignmentOnSameEasternDate(
        parseEasternDatetimeLocalValue(scheduledAt),
        otherActiveForBuff,
      )
    ) {
      setScheduledAt("");
    }
  };

  // Lets a queue-list row's clock icon open this dialog pre-filled for that specific
  // character, defaulting to the next available slot for its item's buff — same logic
  // handleSelectBuff uses for a fresh create, just with the character already chosen. If that
  // character already has an active turn-in scheduled, open it in edit mode instead of
  // stacking a second one on top — the queue-list icon turns orange for exactly this case.
  const { registerHandler } = useScheduleDialog();
  useEffect(() => {
    registerHandler((targetStatusId) => {
      const status = statuses?.find((s) => s.id === targetStatusId);
      if (!status) return;

      const existingAssignment = (activeAssignments ?? []).find(
        (a) => a.status.id === targetStatusId,
      );
      if (existingAssignment) {
        openEditDialog(existingAssignment);
        return;
      }

      const buff = WORLD_BUFF_BY_ITEM[status.item as WorldBuffItem];
      const otherActiveForBuff = (activeAssignments ?? [])
        .filter((a) => WORLD_BUFF_BY_ITEM[a.status.item as WorldBuffItem] === buff)
        .map((a) => new Date(a.scheduledAt));
      const { hour, minute } = WORLD_BUFF_DEFAULT_TIME_ET[buff];

      setDialogMode("create");
      setEditingAssignmentId(null);
      setSelectedBuff(buff);
      setStatusId(targetStatusId);
      setScheduledAt(computeDefaultScheduledAt(hour, minute, otherActiveForBuff));
      setNotes("");
      setDialogOpen(true);
    });
  }, [registerHandler, statuses, activeAssignments]);

  // Editing an already-dropped assignment: its status row is no longer "ready", so it wouldn't
  // otherwise appear in the picker at all — include it explicitly so the Select shows the
  // currently-linked character instead of falling back to the placeholder.
  const currentEditingStatus = statuses?.find((s) => s.id === statusId);
  const characterOptions = (
    currentEditingStatus && !readyStatuses.some((s) => s.id === currentEditingStatus.id)
      ? [currentEditingStatus, ...readyStatuses]
      : readyStatuses
  )
    .filter((s) => selectedBuff && WORLD_BUFF_BY_ITEM[s.item as WorldBuffItem] === selectedBuff)
    .sort((a, b) => {
      if (a.queueType !== b.queueType) {
        return QUEUE_TYPE_ORDER[a.queueType] - QUEUE_TYPE_ORDER[b.queueType];
      }
      return a.characterName.localeCompare(b.characterName);
    });

  // Characters that already have an active (not-yet-dropped) turn-in scheduled elsewhere —
  // italicized in the picker as a heads-up against double-booking. Excludes the assignment
  // currently being edited, since that one's own scheduling doesn't count as "elsewhere".
  const scheduledStatusIds = new Set(
    (activeAssignments ?? []).filter((a) => a.id !== editingAssignmentId).map((a) => a.status.id),
  );

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!statusId || !scheduledAt) return;
    if (dialogMode === "create") {
      createAssignment.mutate({
        statusId,
        scheduledAt: parseEasternDatetimeLocalValue(scheduledAt),
        notes: notes.trim() || null,
      });
    } else if (editingAssignmentId) {
      updateAssignment.mutate({
        assignmentId: editingAssignmentId,
        statusId,
        scheduledAt: parseEasternDatetimeLocalValue(scheduledAt),
        notes: notes.trim() || null,
      });
    }
  };

  const isSaving = createAssignment.isPending || updateAssignment.isPending;

  const renderRowActions = (
    a: ActiveAssignment | PastAssignment,
    { isPast }: { isPast: boolean },
  ) => (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            disabled={setWorldBuffState.isPending}
            onClick={() =>
              setWorldBuffState.mutate(
                { statusId: a.status.id, state: isPast ? "ready_to_drop" : "dropped" },
                {
                  onSuccess: () =>
                    toast({ title: isPast ? "Reverted to ready" : "Marked as dropped" }),
                },
              )
            }
          >
            {isPast ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">
          {isPast ? "Revert to ready" : "Mark as dropped"}
        </TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(a)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">Edit</TooltipContent>
      </Tooltip>
      <AlertDialog>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
          </TooltipTrigger>
          <TooltipContent className="bg-secondary text-muted-foreground">Delete</TooltipContent>
        </Tooltip>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this assignment?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the scheduled turn-in for {a.status.characterName}. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteAssignment.mutate({ assignmentId: a.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <CardTitle className="text-base">Scheduled turn-ins</CardTitle>
          {canManage && (
            <Tabs value={view} onValueChange={(v) => setView(v as "active" | "past")}>
              <TabsList className="h-8">
                <TabsTrigger value="active" className="h-6 px-2 text-xs">
                  Active
                </TabsTrigger>
                <TabsTrigger value="past" className="h-6 px-2 text-xs">
                  Completed
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
        {canManage && (
          <Dialog
            open={dialogOpen}
            onOpenChange={(open) => (open ? setDialogOpen(true) : closeDialog())}
          >
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreateDialog}>
                <CalendarClock className="h-4 w-4" />
                Schedule
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {dialogMode === "create" ? "Schedule a turn-in" : "Edit turn-in"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 items-center gap-3">
                  <Label>Buff</Label>
                  <div className="flex gap-2">
                    {WORLD_BUFFS.map((buff) => (
                      <Tooltip key={buff}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => handleSelectBuff(buff)}
                            className={cn(
                              "flex h-11 w-11 items-center justify-center rounded-md border transition-colors",
                              selectedBuff === buff
                                ? "border-primary bg-primary/15"
                                : "border-border/60 hover:border-border",
                            )}
                          >
                            {buff === "dragon" ? (
                              <DragonBuffIcon size={28} />
                            ) : (
                              <BuffIcon buff={buff} size={28} />
                            )}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="bg-secondary text-muted-foreground">
                          {WORLD_BUFF_LABELS[buff]}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 items-center gap-3">
                  <Label>Character</Label>
                  <Select value={statusId} onValueChange={setStatusId} disabled={!selectedBuff}>
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          selectedBuff ? "Select a ready character" : "Pick a buff first"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {characterOptions.map((s: StatusRow) => {
                        const { Icon: QueueIcon, className: queueIconClassName } =
                          QUEUE_TYPE_ICON[s.queueType];
                        const alreadyScheduled = scheduledStatusIds.has(s.id);
                        return (
                          <SelectItem key={s.id} value={s.id}>
                            {/* Radix's ItemText shrinks to fit its content, so a plain w-full
                                span here has nothing to expand against — an explicit width is
                                what actually lines the icons up into a right-aligned column. */}
                            <span className="flex w-72 items-center gap-2">
                              <WorldBuffIcon item={s.item as WorldBuffItem} size={16} />
                              <span
                                className={cn(
                                  "min-w-0 flex-1 truncate",
                                  alreadyScheduled && "italic",
                                )}
                              >
                                {s.characterName}
                              </span>
                              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">
                                  Submitted{" "}
                                  {formatEasternDateTime(new Date(s.createdAt), "M/d/yyyy")}
                                </span>
                                {s.notes?.trim() && <NotesIndicator notes={s.notes} />}
                                <QueueIcon className={cn("h-4 w-4 shrink-0", queueIconClassName)} />
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 items-center gap-3">
                  <Label htmlFor="wb-scheduled-at">Day / time (Server)</Label>
                  <Input
                    id="wb-scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wb-assignment-notes">Notes (optional)</Label>
                  <Input
                    id="wb-assignment-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={isSaving || !statusId || !scheduledAt}>
                    {dialogMode === "create" ? "Schedule" : "Save changes"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {view === "active" ? (
          activeLoading ? (
            <div className="py-4 text-center text-muted-foreground">Loading...</div>
          ) : !activeAssignments || activeAssignments.length === 0 ? (
            <div className="py-4 text-center text-muted-foreground">No active assignments.</div>
          ) : (
            <div className="space-y-3">
              {(() => {
                const activeGroups = groupByEasternDate(sortAssignments(activeAssignments));
                const todayKey = formatInTimeZone(new Date(), EASTERN_TIMEZONE, "yyyy-MM-dd");
                // Only the soonest group at-or-after today is "upcoming" — later future groups
                // stay gray so the highlight points at what's actionable next, not everything ahead.
                const upcomingIndex = activeGroups.findIndex((g) => g.dateKey >= todayKey);
                return activeGroups.map((group, i) => (
                  <div key={group.dateKey} className="space-y-1.5">
                    <h3
                      className={cn(
                        "text-xs font-semibold uppercase tracking-wide",
                        group.dateKey < todayKey
                          ? "text-destructive"
                          : i === upcomingIndex
                            ? "text-primary"
                            : "text-muted-foreground",
                      )}
                    >
                      {group.label}
                    </h3>
                    <div className="space-y-1.5">
                      {group.rows.map((a) => (
                        <AssignmentRow
                          key={a.id}
                          assignment={a}
                          className="border-border/60"
                          timeOnly
                          canManage={canManage}
                          action={canManage && renderRowActions(a, { isPast: false })}
                        />
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )
        ) : pastLoading ? (
          <div className="py-4 text-center text-muted-foreground">Loading...</div>
        ) : !pastAssignments || pastAssignments.length === 0 ? (
          <div className="py-4 text-center text-muted-foreground">No completed turn-ins.</div>
        ) : (
          <div className="space-y-3">
            {groupByEasternDate(sortAssignments(pastAssignments), { order: "desc" }).map(
              (group) => (
                <div key={group.dateKey} className="space-y-1.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h3>
                  <div className="space-y-1.5">
                    {group.rows.map((a) => (
                      <AssignmentRow
                        key={a.id}
                        assignment={a}
                        className="border-border/40 bg-muted/30"
                        timeOnly
                        canManage={canManage}
                        action={canManage && renderRowActions(a, { isPast: true })}
                      />
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
