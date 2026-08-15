"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import {
  ChevronDown,
  CalendarClock,
  Check,
  Loader2,
  Moon,
  MoreHorizontal,
  Pencil,
  Undo2,
  Trash2,
  UserRoundSearch,
} from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { CharacterSelector } from "~/components/characters/character-selector";
import { WorldBuffCharacterIdentity } from "./world-buff-character-identity";
import { DragonBuffIcon, WorldBuffIcon } from "./world-buff-icon";
import { NotesIndicator, QUEUE_TYPE_ICON, type WorldBuffQueueType } from "./queue-type-icon";
import { useScheduleDialog } from "./schedule-dialog-context";
import { useSetWorldBuffState } from "./use-world-buff-mutations";
import { SCOPE } from "~/lib/scopes";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { cn } from "~/lib/utils";
import {
  WORLD_BUFF_ITEM_LABELS,
  WORLD_BUFF_BY_ITEM,
  WORLD_BUFF_LABELS,
  type WorldBuffItem,
} from "~/lib/world-buffs";

type StatusRow = RouterOutputs["worldBuff"]["getAll"][number];

const QUEUE_TYPE_TABS = ["all", "main", "alt", "backup"] as const;
type QueueTypeTab = (typeof QUEUE_TYPE_TABS)[number];

// "Active" (the default) hides manager-flagged-inactive rows; "All" shows everyone regardless.
const ACTIVITY_TABS = ["active", "all"] as const;
type ActivityTab = (typeof ACTIVITY_TABS)[number];

// One icon encodes both queue type and state, rather than a text pill: the queue-type icon/color
// (green main, blue alt, orange backup) while ready to drop, and the same icon shape grayed out
// once dropped — so a past drop still reads at a glance as "this was a main/alt/backup", just
// deemphasized. The label still shows up via tooltip, since color/icon alone isn't enough for
// accessibility.
function StatusIndicator({ row }: { row: { state: string; queueType: WorldBuffQueueType } }) {
  const { Icon, className, label } = QUEUE_TYPE_ICON[row.queueType];
  const dropped = row.state === "dropped";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Icon className={cn("h-4 w-4", dropped ? "text-muted-foreground" : className)} />
        </span>
      </TooltipTrigger>
      <TooltipContent className="bg-secondary text-muted-foreground">
        {dropped ? `${label} · Dropped` : label}
      </TooltipContent>
    </Tooltip>
  );
}

const QUEUE_TYPES: WorldBuffQueueType[] = ["main", "alt", "backup"];

/** Consolidates an active row's secondary manager actions — mark dropped, mark inactive, re-tag
 *  the queue, delete — into a single "…" trigger instead of a growing row of icon buttons.
 *  Scheduling stays a separate, always-visible button next to this one (it's the core action on
 *  this screen, not worth an extra click to reach). `StatusIndicator` next to both still shows
 *  the current queue type at a glance; this only handles changing it. Owns its own
 *  delete-confirmation dialog (rather than nesting an `AlertDialogTrigger` inside a
 *  `DropdownMenuItem`, which closes the menu before the dialog can open) — selecting "Delete"
 *  just flips local state, and the dialog renders as an independent sibling. */
function RowActionsMenu({
  row,
  inactive,
  onSetQueueType,
  onMarkDropped,
  onToggleInactive,
  onDelete,
  onEditSubmission,
  disabled,
}: {
  row: StatusRow;
  inactive: boolean;
  onSetQueueType: (queueType: WorldBuffQueueType) => void;
  onMarkDropped: () => void;
  onToggleInactive: () => void;
  onDelete: () => void;
  onEditSubmission: (input: {
    characterName: string;
    characterId: number | null;
    notes: string | null;
  }) => void;
  disabled: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(row.characterName);
  const [editCharacterId, setEditCharacterId] = useState<number | null>(row.characterId);
  const [editNotes, setEditNotes] = useState(row.notes ?? "");

  const openEdit = () => {
    setEditName(row.characterName);
    setEditCharacterId(row.characterId);
    setEditNotes(row.notes ?? "");
    setEditOpen(true);
  };

  const handleEditSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) return;
    onEditSubmission({
      characterName: trimmed,
      characterId: editCharacterId,
      notes: editNotes.trim() || null,
    });
    setEditOpen(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={disabled}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onMarkDropped}>
            <Check className="h-4 w-4" />
            Mark dropped
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleInactive}>
            <Moon className="h-4 w-4" />
            {inactive ? "Mark Active" : "Mark Inactive"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {QUEUE_TYPES.filter((queueType) => queueType !== row.queueType).map((queueType) => {
            const opt = QUEUE_TYPE_ICON[queueType];
            return (
              <DropdownMenuItem key={queueType} onSelect={() => onSetQueueType(queueType)}>
                <opt.Icon className={cn("h-4 w-4", opt.className)} />
                Move to {opt.label}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openEdit}>
            <Pencil className="h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {row.characterName}&apos;s availability for this item, and any turn-in
              scheduled for it. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit submission</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="wb-edit-name">Character name</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="wb-edit-name"
                  value={editName}
                  onChange={(e) => {
                    setEditName(e.target.value);
                    setEditCharacterId(null);
                  }}
                  maxLength={128}
                  required
                  className="flex-1"
                />
                <CharacterSelector
                  characterSet="all"
                  onSelectAction={(character) => {
                    setEditName(character.name);
                    setEditCharacterId(character.characterId);
                  }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="shrink-0"
                    aria-label="Link to a roster character"
                  >
                    <UserRoundSearch className="h-4 w-4" />
                  </Button>
                </CharacterSelector>
              </div>
              <p className="text-xs text-muted-foreground">
                {editCharacterId
                  ? "Linked to a roster character."
                  : "Not linked to a roster character — free-text name only."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wb-edit-notes">Notes</Label>
              <Input
                id="wb-edit-notes"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                maxLength={2000}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={disabled || !editName.trim()}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Past-drop rows only need one destructive action, so this is a much smaller sibling of
 *  `RowActionsMenu` — a "…" trigger scoped to just Delete, with its own confirm-dialog state for
 *  the same nested-trigger reason documented there. */
function PastRowMenu({
  row,
  onDelete,
  disabled,
}: {
  row: StatusRow;
  onDelete: () => void;
  disabled: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={disabled}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => setConfirmOpen(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {row.characterName}&apos;s availability for this item, and any turn-in
              scheduled for it. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={onDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Date-only here — the exact time a character submitted/dropped isn't meaningful, unlike the
// scheduled turn-in time shown in AssignmentList, which keeps the full date + time.
const DATE_FORMAT = "M/d/yyyy";

function QueueRow({
  row,
  dateLabel,
  date,
  canManage,
  action,
}: {
  row: StatusRow;
  dateLabel: string;
  date: Date | null;
  canManage: boolean;
  action: React.ReactNode;
}) {
  const dropped = row.state === "dropped";
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <WorldBuffIcon item={row.item as WorldBuffItem} size={18} grayscale={dropped} />
        <div className="min-w-0">
          <WorldBuffCharacterIdentity character={row} showDiscord={canManage} dropped={dropped} />
          {date && (
            <div className="text-left text-[11px] text-muted-foreground">
              {dateLabel} {formatEasternDateTime(date, DATE_FORMAT)}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5">{action}</div>
    </li>
  );
}

export function WorldBuffQueueList({
  items,
  title,
}: {
  /** Display-only grouping: Onyxia's Head and Nefarian's Head both grant Dragon, so the
   *  dashboard passes both here to render one combined card instead of two — the underlying
   *  data stays per-item (`row.item`), only the queue list's presentation is merged. */
  items: WorldBuffItem[];
  title?: string;
}) {
  const { data: session } = useSession();
  const canManage = !!session?.user?.scopes?.includes(SCOPE.WORLDBUFF_MANAGE);
  const { toast } = useToast();
  const utils = api.useUtils();
  const { data, isLoading } = api.worldBuff.getAll.useQuery();
  const [queueTypeTab, setQueueTypeTab] = useState<QueueTypeTab>("all");
  const [activityTab, setActivityTab] = useState<ActivityTab>("active");
  const [pastOpen, setPastOpen] = useState(false);

  const setState = useSetWorldBuffState();
  const { openScheduleFor } = useScheduleDialog();

  const updateQueueType = api.worldBuff.updateQueueType.useMutation({
    onMutate: async (input) => {
      await utils.worldBuff.getAll.cancel();
      const prevGetAll = utils.worldBuff.getAll.getData();
      utils.worldBuff.getAll.setData(undefined, (old) =>
        old?.map((row) =>
          row.id === input.statusId ? { ...row, queueType: input.queueType } : row,
        ),
      );
      return { prevGetAll };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevGetAll) utils.worldBuff.getAll.setData(undefined, ctx.prevGetAll);
      toast({
        title: "Failed to update list",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      void utils.worldBuff.getAll.invalidate();
    },
  });

  const setInactive = api.worldBuff.setInactive.useMutation({
    onMutate: async (input) => {
      await utils.worldBuff.getAll.cancel();
      const prevGetAll = utils.worldBuff.getAll.getData();
      const markedInactiveAt = input.inactive ? new Date() : null;
      utils.worldBuff.getAll.setData(undefined, (old) =>
        old?.map((row) => (row.id === input.statusId ? { ...row, markedInactiveAt } : row)),
      );
      return { prevGetAll };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevGetAll) utils.worldBuff.getAll.setData(undefined, ctx.prevGetAll);
      toast({
        title: "Failed to update list",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      void utils.worldBuff.getAll.invalidate();
    },
  });

  const updateSubmission = api.worldBuff.updateSubmission.useMutation({
    onMutate: async (input) => {
      await utils.worldBuff.getAll.cancel();
      const prevGetAll = utils.worldBuff.getAll.getData();
      utils.worldBuff.getAll.setData(undefined, (old) =>
        old?.map((row) =>
          row.id === input.statusId
            ? {
                ...row,
                characterName: input.characterName ?? row.characterName,
                characterId: input.characterId !== undefined ? input.characterId : row.characterId,
                notes: input.notes !== undefined ? input.notes : row.notes,
              }
            : row,
        ),
      );
      return { prevGetAll };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevGetAll) utils.worldBuff.getAll.setData(undefined, ctx.prevGetAll);
      toast({
        title: "Failed to update submission",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      void utils.worldBuff.getAll.invalidate();
    },
  });

  const deleteStatus = api.worldBuff.deleteStatus.useMutation({
    onMutate: async (input) => {
      await utils.worldBuff.getAll.cancel();
      const prevGetAll = utils.worldBuff.getAll.getData();
      utils.worldBuff.getAll.setData(undefined, (old) =>
        old?.filter((row) => row.id !== input.statusId),
      );
      return { prevGetAll };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.prevGetAll) utils.worldBuff.getAll.setData(undefined, ctx.prevGetAll);
      toast({
        title: "Failed to delete submission",
        description: error.message,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: "Submission deleted" });
    },
    onSettled: () => {
      void utils.worldBuff.getAll.invalidate();
      void utils.worldBuff.listActiveAssignments.invalidate();
      void utils.worldBuff.listPastAssignments.invalidate();
    },
  });

  const itemsKey = items.join(",");
  const { activeRows, pastRows, hiddenInactiveCount } = useMemo(() => {
    const itemRows = (data ?? []).filter((row) => items.includes(row.item));
    const queueFiltered = itemRows
      .filter((row) => row.state === "ready_to_drop")
      .filter((row) => queueTypeTab === "all" || row.queueType === queueTypeTab);
    const active = queueFiltered
      .filter((row) => activityTab === "all" || row.markedInactiveAt === null)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const past = itemRows
      .filter((row) => row.state === "dropped")
      .sort((a, b) => {
        const aTime = a.droppedAt ? new Date(a.droppedAt).getTime() : 0;
        const bTime = b.droppedAt ? new Date(b.droppedAt).getTime() : 0;
        return bTime - aTime;
      });
    // Only meaningful on "Active" — "All" already shows everything, so there's nothing hidden.
    const hiddenInactiveCount = queueFiltered.length - active.length;
    return { activeRows: active, pastRows: past, hiddenInactiveCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsKey is items' stable identity
  }, [data, itemsKey, queueTypeTab, activityTab]);

  const primaryItem = items[0]!;
  const buff = WORLD_BUFF_BY_ITEM[primaryItem];

  return (
    <Card>
      <CardHeader className="px-2 py-1.5 sm:px-2.5 sm:py-2">
        <CardTitle className="flex items-center gap-2 text-base">
          {items.length > 1 ? (
            <DragonBuffIcon size={22} />
          ) : (
            <WorldBuffIcon item={primaryItem} size={22} />
          )}
          <span>
            <span className="block">{title ?? WORLD_BUFF_ITEM_LABELS[primaryItem]}</span>
            <span className="block text-xs font-normal text-muted-foreground">
              {WORLD_BUFF_LABELS[buff]}
            </span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-2 pb-1.5 sm:px-2.5 sm:pb-2">
        <div className="flex items-center justify-between gap-2">
          <Tabs value={activityTab} onValueChange={(v) => setActivityTab(v as ActivityTab)}>
            <TabsList className="h-8">
              <TabsTrigger value="active" className="h-6 px-2.5 text-xs">
                Active
              </TabsTrigger>
              <TabsTrigger value="all" className="h-6 px-2.5 text-xs">
                All
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={queueTypeTab} onValueChange={(v) => setQueueTypeTab(v as QueueTypeTab)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="h-6 px-2.5 text-xs">
                All
              </TabsTrigger>
              {QUEUE_TYPES.map((queueType) => {
                const opt = QUEUE_TYPE_ICON[queueType];
                return (
                  <TabsTrigger
                    key={queueType}
                    value={queueType}
                    aria-label={opt.label}
                    className="h-6 px-2.5"
                  >
                    <opt.Icon className={cn("h-3.5 w-3.5", opt.className)} />
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>
        {isLoading ? (
          <div className="py-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : activeRows.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">No submissions yet.</div>
        ) : (
          <ul className="space-y-1.5">
            {activeRows.map((row) => {
              return (
                <QueueRow
                  key={row.id}
                  row={row}
                  dateLabel="Submitted"
                  date={new Date(row.createdAt)}
                  canManage={canManage}
                  action={
                    <>
                      {row.notes?.trim() && <NotesIndicator notes={row.notes} />}
                      <StatusIndicator row={row} />
                      {canManage && (
                        <>
                          <div className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
                          {!row.characterId && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex">
                                  <CharacterSelector
                                    characterSet="all"
                                    onSelectAction={(character) =>
                                      updateSubmission.mutate({
                                        statusId: row.id,
                                        characterName: character.name,
                                        characterId: character.characterId,
                                      })
                                    }
                                  >
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      aria-label="Link to a roster character"
                                      disabled={updateSubmission.isPending}
                                    >
                                      {updateSubmission.isPending ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <UserRoundSearch className="h-3.5 w-3.5" />
                                      )}
                                    </Button>
                                  </CharacterSelector>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="bg-secondary text-muted-foreground">
                                Link to a roster character
                              </TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className={cn(
                                  "h-6 w-6",
                                  row.assignments.length > 0 && "text-primary hover:text-primary",
                                )}
                                onClick={() => openScheduleFor(row.id)}
                              >
                                <CalendarClock className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary text-muted-foreground">
                              {row.assignments.length > 0
                                ? "Edit scheduled turn-in"
                                : "Schedule turn-in"}
                            </TooltipContent>
                          </Tooltip>
                          <RowActionsMenu
                            row={row}
                            inactive={row.markedInactiveAt !== null}
                            disabled={
                              updateQueueType.isPending ||
                              setState.isPending ||
                              setInactive.isPending ||
                              deleteStatus.isPending ||
                              updateSubmission.isPending
                            }
                            onSetQueueType={(queueType) =>
                              updateQueueType.mutate({ statusId: row.id, queueType })
                            }
                            onMarkDropped={() =>
                              setState.mutate({ statusId: row.id, state: "dropped" })
                            }
                            onToggleInactive={() =>
                              setInactive.mutate({
                                statusId: row.id,
                                inactive: row.markedInactiveAt === null,
                              })
                            }
                            onDelete={() => deleteStatus.mutate({ statusId: row.id })}
                            onEditSubmission={(input) =>
                              updateSubmission.mutate({ statusId: row.id, ...input })
                            }
                          />
                        </>
                      )}
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
        {activityTab === "active" && hiddenInactiveCount > 0 && (
          <p className="text-center text-xs italic text-muted-foreground">
            Hiding {hiddenInactiveCount} inactive character{hiddenInactiveCount === 1 ? "" : "s"}
          </p>
        )}

        <Collapsible open={pastOpen} onOpenChange={setPastOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 transition-transform",
                  !pastOpen && "-rotate-90",
                )}
              />
              Past Character Drops ({pastRows.length})
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            {pastRows.length === 0 ? (
              <div className="py-2 text-center text-xs text-muted-foreground">
                Nothing dropped yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {pastRows.map((row) => (
                  <QueueRow
                    key={row.id}
                    row={row}
                    dateLabel="Dropped"
                    date={row.droppedAt ? new Date(row.droppedAt) : null}
                    canManage={canManage}
                    action={
                      <>
                        {row.notes?.trim() && <NotesIndicator notes={row.notes} />}
                        <StatusIndicator row={row} />
                        {canManage && (
                          <>
                            <div className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  disabled={setState.isPending}
                                  onClick={() =>
                                    setState.mutate({ statusId: row.id, state: "ready_to_drop" })
                                  }
                                >
                                  <Undo2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-secondary text-muted-foreground">
                                Revert to ready
                              </TooltipContent>
                            </Tooltip>
                            <PastRowMenu
                              row={row}
                              disabled={deleteStatus.isPending}
                              onDelete={() => deleteStatus.mutate({ statusId: row.id })}
                            />
                          </>
                        )}
                      </>
                    }
                  />
                ))}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
