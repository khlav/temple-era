"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Trash2,
  ExternalLink,
  Loader2,
  Pencil,
  Check,
  X,
  Download,
  ChevronDown,
  Zap,
  Settings,
  Globe,
  GlobeLock,
} from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Switch } from "~/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import {
  INSTANCE_TO_ZONE,
  CUSTOM_ZONE_ID,
  CUSTOM_ZONE_DISPLAY_NAME,
} from "~/lib/raid-zones";
import { formatRaidDate } from "~/utils/date-formatting";
import { ZoneSelect } from "./zone-select";
import { PollingIndicator } from "./polling-indicator";

const ZONE_BADGE_CLASSES: Record<string, string> = {
  naxxramas: "bg-[hsl(var(--chart-2)/0.15)] border-chart-2 text-chart-2",
  aq40: "bg-[hsl(var(--chart-4)/0.15)] border-chart-4 text-chart-4",
  bwl: "bg-[hsl(var(--chart-5)/0.15)] border-chart-5 text-chart-5",
  mc: "bg-[hsl(var(--chart-3)/0.15)] border-chart-3 text-chart-3",
};

interface RaidPlanHeaderProps {
  planId: string;
  name: string;
  zoneId: string;
  raidHelperEventId: string;
  startAt?: Date | null;
  event: { raidId: number; name: string; date: string } | null;
  onNameUpdate?: () => void;
  isPublic?: boolean;
  onTogglePublic?: (isPublic: boolean) => void;
  onZoneUpdate?: () => void;
  onExportAllAA?: (categoryName: string) => void | Promise<void>;
  isExportingAA?: boolean;
  isPollingActive?: boolean;
  onRestartPolling?: () => void;
}

export function RaidPlanHeader({
  planId,
  name,
  zoneId,
  raidHelperEventId,
  startAt,
  event,
  onNameUpdate,
  isPublic,
  onTogglePublic,
  onZoneUpdate,
  onExportAllAA,
  isExportingAA,
  isPollingActive = true,
  onRestartPolling,
}: RaidPlanHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [editedZoneId, setEditedZoneId] = useState(zoneId);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [categoryName, setCategoryName] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const deleteMutation = api.raidPlan.delete.useMutation({
    onSuccess: () => {
      toast({
        title: "Plan deleted",
        description: "The raid plan has been deleted.",
      });
      router.push("/raid-manager/raid-planner");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = api.raidPlan.update.useMutation({
    onMutate: async (newPlan) => {
      // Cancel outgoing refetches
      await utils.raidPlan.getById.cancel({ planId });

      // Snapshot previous value
      const previousPlan = utils.raidPlan.getById.getData({ planId });

      // Optimistically update
      utils.raidPlan.getById.setData({ planId }, (old) => {
        if (!old) return old;
        return {
          ...old,
          name: newPlan.name ?? old.name,
          zoneId: newPlan.zoneId ?? old.zoneId,
        };
      });

      // Close edit mode immediately for optimistic feel
      setIsEditing(false);
      onNameUpdate?.();
      onZoneUpdate?.();

      return { previousPlan };
    },
    onError: (error, _newPlan, context) => {
      // Rollback
      if (context?.previousPlan) {
        utils.raidPlan.getById.setData({ planId }, context.previousPlan);
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      void utils.raidPlan.getById.invalidate({ planId });
    },
  });

  const handleDelete = () => {
    deleteMutation.mutate({ planId });
  };

  const handleSave = () => {
    const trimmed = editedName.trim();
    if (!trimmed) {
      return;
    }

    const updates: { planId: string; name?: string; zoneId?: string } = {
      planId,
    };

    if (trimmed !== name) {
      updates.name = trimmed;
    }

    if (editedZoneId !== zoneId) {
      updates.zoneId = editedZoneId;
    }

    if (Object.keys(updates).length === 1) {
      setIsEditing(false);
      return;
    }

    updateMutation.mutate(updates);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedName(name);
    setEditedZoneId(zoneId);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  // Get display name for zone
  const zoneName =
    zoneId === CUSTOM_ZONE_ID
      ? CUSTOM_ZONE_DISPLAY_NAME
      : (INSTANCE_TO_ZONE[zoneId] ?? zoneId);

  return (
    <div className="flex gap-4">
      {/* Left column: title + metadata */}
      <div className="flex-1 space-y-1">
        <div>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Badge
                variant="secondary"
                className="pointer-events-none px-2 py-0.5 text-muted-foreground"
              >
                Plan
              </Badge>
              <Input
                ref={inputRef}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-9 w-64 text-xl font-bold"
                disabled={updateMutation.isPending}
              />
              <ZoneSelect
                value={editedZoneId}
                onValueChange={setEditedZoneId}
                className="h-9 w-[180px]"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleCancel}
                disabled={updateMutation.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="group flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-default items-center gap-2">
                      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                        <Badge
                          variant="secondary"
                          className="pointer-events-none px-2 py-0.5 text-muted-foreground"
                        >
                          Plan
                        </Badge>
                        {name}
                      </h1>
                      <Badge
                        variant="secondary"
                        className={`pointer-events-none hidden px-2 py-0.5 lg:inline-flex ${ZONE_BADGE_CLASSES[zoneId] ?? "text-muted-foreground"}`}
                      >
                        {zoneName}
                      </Badge>
                    </div>
                  </TooltipTrigger>
                  {(startAt ?? event) && (
                    <TooltipContent
                      side="top"
                      className="dark border-none bg-secondary text-muted-foreground"
                    >
                      {startAt ? (
                        <p>{formatRaidDate(startAt)}</p>
                      ) : event ? (
                        <a
                          href={`/raids/${event.raidId}`}
                          className="hover:underline"
                        >
                          Event: {event.name} ({event.date})
                        </a>
                      ) : null}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => {
                  setIsEditing(true);
                  setEditedName(name);
                  setEditedZoneId(zoneId);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right column: buttons */}
      <div className="flex-none">
        <div className="flex flex-col items-end gap-1">
          {onExportAllAA && (
            <>
              <div className="flex items-center gap-2">
                <PollingIndicator
                  isPollingActive={isPollingActive}
                  onRestartPolling={onRestartPolling}
                  side="left"
                  activeTooltip={
                    <div className="flex w-fit flex-col gap-0.5 whitespace-nowrap">
                      <span className="font-bold">Live Updates</span>
                      <span className="text-xs">
                        Syncing near-real-time updates from other users.
                      </span>
                    </div>
                  }
                  inactiveTooltip={
                    <div className="flex w-fit flex-col gap-0.5 whitespace-nowrap">
                      <span className="font-bold">Polling Paused</span>
                      <span className="text-xs">
                        No updates in the last 5 minutes. Click to resume.
                      </span>
                    </div>
                  }
                />
                {onTogglePublic && (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-2">
                            <label
                              htmlFor="public-toggle"
                              className={
                                "text-sm font-medium text-muted-foreground" +
                                (isPublic ? " text-primary" : "")
                              }
                            >
                              {isPublic ? (
                                <Globe className="h-5 w-5" />
                              ) : (
                                <GlobeLock className="h-5 w-5" />
                              )}
                            </label>
                            <Switch
                              id="public-toggle"
                              checked={isPublic ?? false}
                              onCheckedChange={onTogglePublic}
                            />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent
                          side="top"
                          className="dark border-none bg-secondary text-muted-foreground"
                        >
                          {isPublic ? (
                            <a
                              href={`/raid-plans/${planId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 hover:text-foreground hover:underline"
                            >
                              Shared with Raiders
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <p>Not shared with Raiders</p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
                <div className="flex">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCategoryName(name);
                      setExportDialogOpen(true);
                    }}
                    disabled={isExportingAA}
                    className="rounded-r-none border-r-0"
                  >
                    {isExportingAA ? (
                      <Loader2 className="h-4 w-4 animate-spin lg:mr-1.5" />
                    ) : (
                      <Download className="h-4 w-4 lg:mr-1.5" />
                    )}
                    <span className="hidden lg:inline">Export AAs</span>
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        disabled={isExportingAA}
                        className="rounded-l-none border-l-0 px-2"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => void onExportAllAA?.(name)}
                      >
                        <Zap className="mr-2 h-3.5 w-3.5" />
                        Quick Export
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Settings / gear menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Settings className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isPublic && (
                      <DropdownMenuItem asChild>
                        <a
                          href={`/raid-plans/${planId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="mr-2 h-3.5 w-3.5" />
                          View Public Plan
                        </a>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem asChild>
                      <a
                        href={`https://raid-helper.dev/event/${raidHelperEventId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        Raid Helper
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setDeleteDialogOpen(true)}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" />
                      Delete Plan
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Dialog
                open={exportDialogOpen}
                onOpenChange={setExportDialogOpen}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Export Encoded AA</DialogTitle>
                    <DialogDescription>
                      Set the category name that will appear in AngryEra.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 py-2">
                    <Input
                      id="aa-category-name"
                      value={categoryName}
                      onChange={(e) => setCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && categoryName.trim()) {
                          setExportDialogOpen(false);
                          void onExportAllAA?.(categoryName.trim());
                        }
                      }}
                      placeholder={name}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setExportDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setExportDialogOpen(false);
                        void onExportAllAA?.(categoryName.trim() || name);
                      }}
                      disabled={isExportingAA}
                    >
                      <Download className="mr-1.5 h-4 w-4" />
                      Export
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}

          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Raid Plan</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{name}&quot;? This will
                  permanently remove all characters, encounters, and
                  assignments. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMutation.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    "Delete"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
