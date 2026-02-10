"use client";

import { Loader2 } from "lucide-react";
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

interface RefreshConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPending: boolean;
  onConfirm: () => void;
}

export function RefreshConfirmDialog({
  open,
  onOpenChange,
  isPending,
  onConfirm,
}: RefreshConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reimport from Raidhelper</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This will re-fetch the current roster from Raidhelper and update
                the plan&apos;s character list.
              </p>
              <ul className="list-disc pl-6 font-medium text-destructive">
                <li>Custom encounter groups will be deleted.</li>
                <li>AA assignments may change or disappear.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              "Refresh"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
