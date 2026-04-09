"use client";

import { useState, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
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
  Eye,
  PencilLine,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
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
  ZONE_ACCENT_CLASSES,
} from "~/lib/raid-zones";
import { formatRaidDate } from "~/utils/date-formatting";
import { ZoneSelect } from "./zone-select";
import { PollingIndicator } from "./polling-indicator";

const ZONE_BADGE_CLASSES = ZONE_ACCENT_CLASSES;

interface RaidPlanPerson {
  id: string | null;
  name: string | null;
  image: string | null;
}

interface RaidPlanPresenceUser {
  userId: string;
  name: string;
  image: string | null;
  mode: "viewing" | "editing";
  lastSeenAt: Date;
  isCurrentUser: boolean;
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

interface RaidPlanHeaderProps {
  planId: string;
  name: string;
  zoneId: string;
  raidHelperEventId: string;
  startAt?: Date | null;
  event: { raidId: number; name: string; date: string } | null;
  creator?: RaidPlanPerson | null;
  lastEditor?: RaidPlanPerson | null;
  lastModifiedAt?: Date | null;
  presence?: RaidPlanPresenceUser[];
  onNameUpdate?: () => void;
  isPublic?: boolean;
  onTogglePublic?: (isPublic: boolean) => void;
  onZoneUpdate?: () => void;
  onExportAllAA?: (categoryName: string) => void | Promise<void>;
  isExportingAA?: boolean;
  isPollingActive?: boolean;
  onRestartPolling?: () => void;
  onEditActivity?: () => void;
}

export function RaidPlanHeader({
  planId,
  name,
  zoneId,
  raidHelperEventId,
  startAt,
  event,
  creator,
  lastEditor,
  lastModifiedAt,
  presence = [],
  onNameUpdate,
  isPublic,
  onTogglePublic,
  onZoneUpdate,
  onExportAllAA,
  isExportingAA,
  isPollingActive = true,
  onRestartPolling,
  onEditActivity,
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
        title: "Failed to delete plan",
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
        title: "Failed to update plan",
        description: error.message,
        variant: "destructive",
      });
    },
    onSettled: () => {
      onEditActivity?.();
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
  const visiblePresence = presence.slice(0, 4);
  const overflowPresenceCount = Math.max(
    0,
    presence.length - visiblePresence.length,
  );
  const lastEditedLabel =
    lastModifiedAt && lastEditor?.name
      ? `Last edited by ${lastEditor.name} ${formatDistanceToNow(new Date(lastModifiedAt), { addSuffix: true })}`
      : lastModifiedAt
        ? `Last updated ${formatDistanceToNow(new Date(lastModifiedAt), { addSuffix: true })}`
        : null;

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
        {!isEditing && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {creator?.name ? <span>Created by {creator.name}</span> : null}
            {lastEditedLabel ? <span>{lastEditedLabel}</span> : null}
          </div>
        )}
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
                      <span className="font-bold">Sync Active</span>
                      <span className="text-xs">
                        This tab is polling for near-real-time planner updates.
                      </span>
                    </div>
                  }
                  inactiveTooltip={
                    <div className="flex w-fit flex-col gap-0.5 whitespace-nowrap">
                      <span className="font-bold">Polling Paused</span>
                      <span className="text-xs">
                        This tab stopped polling after 5 minutes of inactivity.
                        Click to resume.
                      </span>
                    </div>
                  }
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 rounded-full border border-border/60 bg-background/80 px-2 py-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <div className="flex -space-x-2">
                          {visiblePresence.length > 0 ? (
                            visiblePresence.map((user) => (
                              <Avatar
                                key={user.userId}
                                className={`h-6 w-6 border-2 ${
                                  user.mode === "editing"
                                    ? "border-primary ring-1 ring-primary/30"
                                    : "border-background"
                                }`}
                              >
                                <AvatarImage src={user.image ?? undefined} />
                                <AvatarFallback className="text-[10px]">
                                  {getInitials(user.name)}
                                </AvatarFallback>
                              </Avatar>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              Just you
                            </span>
                          )}
                          {overflowPresenceCount > 0 ? (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground">
                              +{overflowPresenceCount}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent
                      side="left"
                      className="dark border-none bg-secondary text-muted-foreground"
                    >
                      <div className="space-y-1">
                        <p className="font-bold text-foreground">
                          Active on this plan
                        </p>
                        {presence.length > 0 ? (
                          presence.map((user) => (
                            <div
                              key={user.userId}
                              className="flex items-center gap-2 text-xs"
                            >
                              {user.mode === "editing" ? (
                                <PencilLine className="h-3 w-3 text-primary" />
                              ) : (
                                <Eye className="h-3 w-3" />
                              )}
                              <span>
                                {user.name}
                                {user.isCurrentUser ? " (You)" : ""}
                              </span>
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
                                {user.mode === "editing"
                                  ? "Editing now"
                                  : "Viewing"}
                              </span>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs">
                            No active viewers right now.
                          </p>
                        )}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
                            <div
                              className={`flex items-center transition-all duration-300 ease-in-out ${
                                isPublic
                                  ? "w-8 scale-100 opacity-100"
                                  : "pointer-events-none w-0 scale-95 opacity-0"
                              }`}
                            >
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground transition-colors hover:text-primary"
                                asChild
                              >
                                <a
                                  href={`/raid-plans/${planId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label="Open public plan in new tab"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
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
