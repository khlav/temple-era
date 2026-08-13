"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronDown, Check, Clock, Undo2, Trash2 } from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
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

/** Manager-only editable version of the queue-type icon — clicking it opens a small menu to
 *  re-tag the submission's queue instead of a separate edit dialog. Only meaningful for still-
 *  active submissions; dropped rows keep the plain read-only `StatusIndicator`. */
function QueueTypeMenu({
  row,
  onSelect,
  disabled,
}: {
  row: { queueType: WorldBuffQueueType };
  onSelect: (queueType: WorldBuffQueueType) => void;
  disabled: boolean;
}) {
  const { Icon, className, label } = QUEUE_TYPE_ICON[row.queueType];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Queue: ${label}. Click to change.`}
          className="inline-flex rounded-sm disabled:pointer-events-none disabled:opacity-50"
        >
          <Icon className={cn("h-4 w-4", className)} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {QUEUE_TYPES.map((queueType) => {
          const opt = QUEUE_TYPE_ICON[queueType];
          return (
            <DropdownMenuItem key={queueType} onSelect={() => onSelect(queueType)}>
              <opt.Icon className={cn("h-4 w-4", opt.className)} />
              {opt.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteSubmissionButton({
  row,
  onConfirm,
  disabled,
}: {
  row: StatusRow;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <AlertDialog>
      <Tooltip>
        <TooltipTrigger asChild>
          <AlertDialogTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-destructive hover:text-destructive"
              disabled={disabled}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
        </TooltipTrigger>
        <TooltipContent className="bg-secondary text-muted-foreground">Delete</TooltipContent>
      </Tooltip>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this submission?</AlertDialogTitle>
          <AlertDialogDescription>
            Removes {row.characterName}&apos;s availability for this item, and any turn-in scheduled
            for it. This can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Date-only here — the exact time a character submitted/dropped isn't meaningful, unlike the
// scheduled turn-in time shown in AssignmentList, which keeps the full date + time.
const DATE_FORMAT = "M/d/yyyy";

function QueueRow({
  row,
  dateLabel,
  date,
  action,
}: {
  row: StatusRow;
  dateLabel: string;
  date: Date | null;
  action: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5">
      <div className="flex min-w-0 items-center gap-2">
        <WorldBuffIcon item={row.item as WorldBuffItem} size={18} />
        <div className="min-w-0">
          <WorldBuffCharacterIdentity character={row} />
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
        title: "Failed to update queue",
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
  const { activeRows, pastRows } = useMemo(() => {
    const itemRows = (data ?? []).filter((row) => items.includes(row.item));
    const active = itemRows
      .filter((row) => row.state === "ready_to_drop")
      .filter((row) => queueTypeTab === "all" || row.queueType === queueTypeTab)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const past = itemRows
      .filter((row) => row.state === "dropped")
      .sort((a, b) => {
        const aTime = a.droppedAt ? new Date(a.droppedAt).getTime() : 0;
        const bTime = b.droppedAt ? new Date(b.droppedAt).getTime() : 0;
        return bTime - aTime;
      });
    return { activeRows: active, pastRows: past };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- itemsKey is items' stable identity
  }, [data, itemsKey, queueTypeTab]);

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
        <Tabs value={queueTypeTab} onValueChange={(v) => setQueueTypeTab(v as QueueTypeTab)}>
          <TabsList className="h-8 w-full">
            <TabsTrigger value="all" className="h-6 flex-1 px-2 text-xs">
              All
            </TabsTrigger>
            <TabsTrigger value="main" className="h-6 flex-1 px-2 text-xs">
              Main
            </TabsTrigger>
            <TabsTrigger value="alt" className="h-6 flex-1 px-2 text-xs">
              Alt
            </TabsTrigger>
            <TabsTrigger value="backup" className="h-6 flex-1 px-2 text-xs">
              Backup
            </TabsTrigger>
          </TabsList>
        </Tabs>
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
                  action={
                    <>
                      {row.notes?.trim() && <NotesIndicator notes={row.notes} />}
                      {canManage ? (
                        <QueueTypeMenu
                          row={row}
                          disabled={updateQueueType.isPending}
                          onSelect={(queueType) =>
                            updateQueueType.mutate({ statusId: row.id, queueType })
                          }
                        />
                      ) : (
                        <StatusIndicator row={row} />
                      )}
                      {canManage && (
                        <>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                disabled={setState.isPending}
                                onClick={() =>
                                  setState.mutate({ statusId: row.id, state: "dropped" })
                                }
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary text-muted-foreground">
                              Mark as dropped
                            </TooltipContent>
                          </Tooltip>
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
                                <Clock className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-secondary text-muted-foreground">
                              {row.assignments.length > 0
                                ? "Edit scheduled turn-in"
                                : "Schedule turn-in"}
                            </TooltipContent>
                          </Tooltip>
                          <DeleteSubmissionButton
                            row={row}
                            disabled={deleteStatus.isPending}
                            onConfirm={() => deleteStatus.mutate({ statusId: row.id })}
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
                    action={
                      <>
                        {row.notes?.trim() && <NotesIndicator notes={row.notes} />}
                        <StatusIndicator row={row} />
                        {canManage && (
                          <>
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
                            <DeleteSubmissionButton
                              row={row}
                              disabled={deleteStatus.isPending}
                              onConfirm={() => deleteStatus.mutate({ statusId: row.id })}
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
