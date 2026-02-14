"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Trash2, ExternalLink, Loader2, Pencil, Check, X } from "lucide-react";
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
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import {
  INSTANCE_TO_ZONE,
  CUSTOM_ZONE_ID,
  CUSTOM_ZONE_DISPLAY_NAME,
} from "~/lib/raid-zones";
import { formatRaidDate } from "~/utils/date-formatting";
import { ZoneSelect } from "./zone-select";

interface RaidPlanHeaderProps {
  planId: string;
  name: string;
  zoneId: string;
  raidHelperEventId: string;
  startAt?: Date | null;
  event: { raidId: number; name: string; date: string } | null;
  createdAt: Date;
  onNameUpdate?: () => void;
  isPublic?: boolean;
  onTogglePublic?: (isPublic: boolean) => void;
  onZoneUpdate?: () => void;
}

export function RaidPlanHeader({
  planId,
  name,
  zoneId,
  raidHelperEventId,
  startAt,
  event,
  createdAt,
  onNameUpdate,
  isPublic,
  onTogglePublic,
  onZoneUpdate,
}: RaidPlanHeaderProps) {
  const router = useRouter();
  const { toast } = useToast();
  const utils = api.useUtils();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(name);
  const [editedZoneId, setEditedZoneId] = useState(zoneId);
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
    <div className="space-y-2">
      {/* Title row with delete button */}
      <div className="flex items-center justify-between gap-4">
        {isEditing ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tracking-tight">
              Raid Plan:
            </span>
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
            <h1 className="text-2xl font-bold tracking-tight">
              Raid Plan: {name}
            </h1>
            <span className="pl-1 text-base text-muted-foreground">
              {zoneName}
            </span>
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

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Raid Plan</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &quot;{name}&quot;? This will
                permanently remove all characters, encounters, and assignments.
                This action cannot be undone.
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

      {/* Metadata row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {startAt && (
          <>
            <span>{formatRaidDate(startAt)}</span>
            <span>|</span>
          </>
        )}
        {event && !startAt && (
          <>
            <a
              href={`/raids/${event.raidId}`}
              className="hover:text-foreground hover:underline"
            >
              Event: {event.name} ({event.date})
            </a>
            <span>|</span>
          </>
        )}
        {onTogglePublic && (
          <>
            <div className="flex items-center gap-2">
              <label
                htmlFor="public-toggle"
                className={
                  "text-sm font-medium text-muted-foreground" +
                  (isPublic ? " text-primary" : "")
                }
              >
                {isPublic ? "Shared with Raiders" : "Share with Raiders"}
              </label>
              <Switch
                id="public-toggle"
                checked={isPublic ?? false}
                onCheckedChange={onTogglePublic}
              />
              {isPublic && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 gap-1 text-xs"
                  onClick={() => {
                    const url = `${window.location.origin}/raid-plans/${planId}`;
                    window.open(url, "_blank");
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in New Tab
                </Button>
              )}
            </div>
            <span>|</span>
          </>
        )}
        {event && !onTogglePublic && <span>|</span>}
        <span>Created: {format(createdAt, "MMM d, yyyy")}</span>
        <span>|</span>
        <a
          href={`https://raid-helper.dev/event/${raidHelperEventId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
        >
          Raid-Helper
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
