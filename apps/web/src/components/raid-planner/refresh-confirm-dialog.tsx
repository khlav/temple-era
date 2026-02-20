"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, UserPlus, RefreshCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";

interface RefreshConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: (mode: "fullReimport" | "addNewSignupsToBench") => void;
}

export function RefreshConfirmDialog({
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: RefreshConfirmDialogProps) {
  const [showFullConfirm, setShowFullConfirm] = useState(false);

  // Reset state when dialog closes (either via internal interaction or external prop change)
  useEffect(() => {
    if (!open) {
      setShowFullConfirm(false);
    }
  }, [open]);

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {showFullConfirm
              ? "Are you absolutely sure?"
              : "Update Raid Roster"}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-2">
              {!showFullConfirm ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Choose how you want to update the character list from
                    Raidhelper signups.
                  </p>

                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => onConfirm("addNewSignupsToBench")}
                      disabled={isPending}
                      className="group flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent disabled:opacity-50"
                    >
                      <div className="mt-0.5 rounded-full bg-primary/10 p-2 text-primary group-hover:bg-primary/20">
                        <UserPlus className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">
                          Add New Signups to Bench
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Only adds missing players. Preserves all current
                          groups, assignments, and AA assignments.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowFullConfirm(true)}
                      disabled={isPending}
                      className="group flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-destructive/20 hover:bg-destructive/5 disabled:opacity-50"
                    >
                      <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive group-hover:bg-destructive/20">
                        <RefreshCcw className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-destructive">
                          Full Reimport
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Resets the entire roster to match RaidHelper.
                          Destructive to all custom groups and assignments.
                        </p>
                      </div>
                    </button>
                  </div>
                </>
              ) : (
                <div className="rounded-md bg-destructive/10 p-4 text-destructive">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Warning: This action cannot be undone
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs font-medium">
                    <li>All custom encounter groups will be deleted.</li>
                    <li>Individual character positions will be reset.</li>
                    <li>AA assignments may change or disappear.</li>
                  </ul>
                  <p className="mt-3 text-xs opacity-80">
                    If you just want to add a few late signups, use the
                    <strong> Add New Signups to Bench</strong> option instead.
                  </p>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-2">
          {showFullConfirm ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFullConfirm(false)}
                disabled={isPending}
              >
                Go Back
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="font-semibold"
                onClick={() => onConfirm("fullReimport")}
                disabled={isPending}
              >
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  "Yes, Full Reimport"
                )}
              </Button>
            </>
          ) : (
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
