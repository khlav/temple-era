"use client";

import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import type { Raid, RaidParticipant } from "~/server/api/interfaces/raid";
import { RaidDetailBase, SidebarCard } from "~/components/raids/raid-detail-base";
import { RaidBenchManager } from "~/components/raids/raid-bench-manager";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Eye, RefreshCw, Save, Loader } from "lucide-react";
import { WCLIcon } from "~/components/ui/wcl-icon";
import { ClassIcon } from "~/components/ui/class-icon";
import UserAvatar from "~/components/ui/user-avatar";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "~/components/ui/tooltip";
import { RaidEditorCoreControls } from "~/components/raids/raid-editor-core-controls";
import React, { type Dispatch, type SetStateAction, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { api } from "~/trpc/react";
import { GenerateWCLReportUrl } from "~/lib/helpers";
import { useToast } from "~/hooks/use-toast";
import { toastRaidLogInUse, toastRaidLogLoaded } from "~/components/raids/raid-toasts";
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
import Link from "next/link";
import { cn } from "~/lib/utils";

const EYEBROW_CLASSNAME =
  "font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground";

export function RaidEditor({
  raidData,
  setRaidDataAction,
  isSendingData,

  editingMode = "new",

  handleSubmitAction,
  handleDeleteAction,
  lastSavedAt,
  cancelHref,
  debug,
}: {
  raidData: Raid;
  setRaidDataAction: Dispatch<SetStateAction<Raid>>;
  isSendingData: boolean;

  editingMode: "new" | "existing";

  handleSubmitAction: () => void;
  handleDeleteAction: () => void;
  /** When set, the top page header (title/Saved-ago/Cancel/Save) renders — only meaningful for
   *  editingMode "existing", where saving no longer navigates away. */
  lastSavedAt?: Date | null;
  cancelHref?: string;
  debug?: boolean;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const { toast } = useToast();
  const utils = api.useUtils();

  const handleInputChangeAction = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setRaidDataAction((raidData) => ({
      ...raidData,
      [e.target.name]: e.target.value,
    }));
  };

  const handleWeightChangeAction = (e: React.FormEvent<HTMLButtonElement>) => {
    setRaidDataAction((raidData) => ({
      ...raidData,
      attendanceWeight: parseFloat(e.currentTarget.value),
    }));
  };

  const handleBenchSelectAction = (character: RaidParticipant) => {
    setRaidDataAction((raidData) => ({
      ...raidData,
      bench: {
        ...raidData.bench,
        [character.characterId]: character,
      },
    }));
  };

  const handleBenchRemoveAction = (character: RaidParticipant) => {
    const newBench = raidData.bench ?? {};
    delete newBench[character.characterId.toString()];

    setRaidDataAction((raidData) => ({
      ...raidData,
      bench: newBench,
    }));
  };

  const { data: raidParticipants, isLoading: isLoadingParticipants } =
    api.raidLog.getUniqueParticipantsFromMultipleLogs.useQuery(raidData.raidLogIds ?? [], {
      enabled: (raidData?.raidLogIds ?? []).length > 0,
    });

  const attendeesList = React.useMemo(
    () =>
      Object.values(raidParticipants ?? {}).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      ),
    [raidParticipants],
  );

  // "Saved X ago" needs to keep ticking while the user stays on the page after a save.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!lastSavedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [lastSavedAt]);

  const [isRefreshingLogs, setIsRefreshingLogs] = useState(false);
  const refreshRaidLogMutation = api.raidLog.refreshRaidLogByRaidLogId.useMutation({
    onSuccess: async () => {
      await utils.raidLog.getUniqueParticipantsFromMultipleLogs.invalidate();
    },
  });
  const handleRefreshAllLogs = async () => {
    setIsRefreshingLogs(true);
    try {
      await Promise.allSettled(
        (raidData.raidLogIds ?? []).map((raidLogId) =>
          refreshRaidLogMutation.mutateAsync(raidLogId),
        ),
      );
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  // Lets a manager staple an additional WCL log onto an already-created raid (e.g. a pull that
  // got split into two reports) without going through the create flow again.
  const [addLogUrlInput, setAddLogUrlInput] = useState("");
  const [addLogId, setAddLogId] = useState("");
  const {
    data: addedRaidLog,
    isLoading: isLoadingAddLog,
    isSuccess: isAddLogSuccess,
  } = api.raidLog.importAndGetRaidLogByRaidLogId.useQuery(addLogId, {
    enabled: !!addLogId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!isAddLogSuccess || !addedRaidLog) return;

    if (addedRaidLog.raidId && addedRaidLog.raidId !== raidData.raidId) {
      toastRaidLogInUse(toast, addedRaidLog);
    } else if (!(raidData.raidLogIds ?? []).includes(addedRaidLog.raidLogId)) {
      setRaidDataAction((prev) => ({
        ...prev,
        raidLogIds: [...(prev.raidLogIds ?? []), addedRaidLog.raidLogId],
        kills: Array.from(new Set([...(prev.kills ?? []), ...(addedRaidLog.kills ?? [])])),
      }));
      toastRaidLogLoaded(toast, addedRaidLog);
    }

    setAddLogUrlInput("");
    setAddLogId("");
  }, [isAddLogSuccess, addedRaidLog]);

  const handleAddLogUrlChange = (value: string) => {
    setAddLogUrlInput(value);
    const match = /([a-zA-Z0-9]{16})/.exec(value);
    if (match?.[1]) setAddLogId(match[1]);
  };

  return (
    <div className="space-y-4 px-1">
      {editingMode === "existing" && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className={cn(EYEBROW_CLASSNAME, "text-primary")}>Guild History</div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Edit raid
            </h1>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {lastSavedAt ? (
              <span className="text-xs text-muted-foreground">
                Saved {formatDistanceToNow(lastSavedAt, { addSuffix: true })}
              </span>
            ) : null}
            <Link href={cancelHref ?? "/raids"}>
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleSubmitAction} disabled={isSendingData}>
              {isSendingData ? (
                <Loader className="animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save raid
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-4">
          <SidebarCard title="Raid Details">
            <RaidEditorCoreControls
              raidData={raidData}
              isSendingData={isSendingData}
              editingMode={editingMode}
              handleInputChangeAction={handleInputChangeAction}
              handleWeightChangeAction={handleWeightChangeAction}
              handleSubmitAction={handleSubmitAction}
              handleDeleteAction={handleDeleteAction}
            />
          </SidebarCard>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <SidebarCard
                title={`Attendees${attendeesList.length > 0 ? ` · ${attendeesList.length}` : ""}`}
                action={
                  <span className="text-xs text-muted-foreground">read-only · from logs</span>
                }
              >
                <div className="max-h-[420px] overflow-y-auto pr-1">
                  {isLoadingParticipants ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
                  ) : attendeesList.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No attendees found.
                    </div>
                  ) : (
                    attendeesList.map((p) => (
                      <div
                        key={p.characterId}
                        className="flex items-center justify-between gap-3 border-b border-border/45 py-2 text-sm last:border-b-0"
                      >
                        <Link
                          href={`/characters/${p.characterId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex min-w-0 items-center gap-2"
                        >
                          <ClassIcon
                            characterClass={p.class.toLowerCase()}
                            px={18}
                            className="shrink-0 rounded-sm"
                          />
                          <span className="truncate text-secondary-foreground transition-colors group-hover:text-primary">
                            {p.name}
                          </span>
                          {p.primaryCharacterName ? (
                            <span className="shrink-0 truncate text-xs text-muted-foreground">
                              {p.primaryCharacterName}
                            </span>
                          ) : null}
                        </Link>
                        <span className="shrink-0 truncate text-sm text-muted-foreground">
                          {p.server}
                        </span>
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-3 border-t border-border/60 pt-2.5 text-xs text-muted-foreground">
                  Pulled from the WCL logs. Alts are credited to their main when attendance is
                  calculated.
                </p>
              </SidebarCard>
            </div>

            <div className="min-w-0 flex-1">
              <RaidBenchManager
                characters={raidData.bench ?? {}}
                onSelectAction={handleBenchSelectAction}
                onRemoveAction={handleBenchRemoveAction}
              />
            </div>
          </div>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[264px]">
          <SidebarCard
            title="WCL logs"
            action={
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleRefreshAllLogs}
                      disabled={isRefreshingLogs || (raidData.raidLogIds ?? []).length === 0}
                      className="flex items-center gap-1 text-[11px] text-primary transition-colors hover:text-primary/80 disabled:pointer-events-none disabled:opacity-50"
                    >
                      <RefreshCw className={cn("h-3 w-3", isRefreshingLogs && "animate-spin")} />
                      Refresh
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-secondary text-muted-foreground">
                    <p>Refresh logs from WarcraftLogs</p>
                    <p className="text-xs">Updates kills and attendees</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
          >
            <div className="flex flex-col gap-1.5">
              {(raidData.raidLogIds ?? []).map((raidLogId) => {
                const reportUrl = GenerateWCLReportUrl(raidLogId);
                return (
                  <Link
                    key={raidLogId}
                    href={reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                  >
                    {raidLogId}
                    <WCLIcon />
                  </Link>
                );
              })}
              {(raidData.raidLogIds ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">No logs linked.</div>
              ) : null}
            </div>
            <Input
              value={addLogUrlInput}
              onChange={(e) => handleAddLogUrlChange(e.target.value)}
              placeholder="Paste another log URL…"
              disabled={isLoadingAddLog}
              autoComplete="off"
              className="mt-2.5 h-9 text-sm"
            />
          </SidebarCard>

          <SidebarCard title={`Kills${raidData.kills ? ` · ${raidData.kills.length}` : ""}`}>
            <div className="flex flex-wrap gap-1.5">
              {(raidData.kills ?? []).map((killName, i) => (
                <span
                  key={`kill_${i}`}
                  className="rounded-lg bg-secondary px-2 py-1 text-xs text-muted-foreground"
                >
                  {killName}
                </span>
              ))}
            </div>
          </SidebarCard>

          <SidebarCard title="Created by">
            <UserAvatar
              name={raidData.creator?.name ?? ""}
              image={raidData.creator?.image ?? ""}
              tooltipSide="left"
              showLabel
            />
          </SidebarCard>

          <Collapsible open={previewOpen} onOpenChange={setPreviewOpen}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-2xl border border-border/70 bg-card/60 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/35 hover:text-primary"
              >
                <Eye className="h-4 w-4" />
                Preview as raid page
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 rounded-2xl border border-border/70 p-3">
                <RaidDetailBase raidData={raidData} isPreview />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </aside>
      </div>

      {editingMode === "existing" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <div>
            <div className="text-sm font-semibold text-foreground">Delete this raid</div>
            <div className="text-xs text-muted-foreground">
              Raid info is lost. Logs and characters stay hidden until used elsewhere.
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm">
                Delete raid
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Raid info will be lost. <br />
                  Logs and characters will be hidden until they are used elsewhere.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-red-800 hover:bg-blend-lighten"
                  onClick={handleDeleteAction}
                >
                  Yes, delete raid information
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {debug && (
        <div className="panel-surface rounded-2xl border border-border/70 p-4">
          <LabeledArrayCodeBlock
            label="DEBUG : Raid State"
            value={JSON.stringify(raidData, null, 2)}
          />
        </div>
      )}
    </div>
  );
}
