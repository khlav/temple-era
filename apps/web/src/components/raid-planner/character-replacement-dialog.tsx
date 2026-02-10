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

interface CharacterReplacementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAssignments?: { encounterName: string; slotName: string }[];
  newCharacterName?: string;
  isPending: boolean;
  onTransfer: () => void;
  onClearAssignments: () => void;
  onCancel: () => void;
}

export function CharacterReplacementDialog({
  open,
  onOpenChange,
  existingAssignments,
  newCharacterName,
  isPending,
  onTransfer,
  onClearAssignments,
  onCancel,
}: CharacterReplacementDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace Character</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                This character has AA assignments in the following encounters:
              </p>
              <ul className="list-inside list-disc text-sm">
                {existingAssignments?.map((a, i) => (
                  <li key={i}>
                    {a.encounterName} ({a.slotName})
                  </li>
                ))}
              </ul>
              <p>What would you like to do?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction onClick={onTransfer} disabled={isPending}>
            Transfer to {newCharacterName}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={onClearAssignments}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Clearing...
              </>
            ) : (
              "Clear Assignments"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
