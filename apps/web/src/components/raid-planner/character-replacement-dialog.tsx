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
import { CLASS_TEXT_COLORS } from "./constants";
import type { AssignmentDetail } from "~/hooks/use-raid-plan-drag-drop";

interface CharacterReplacementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAssignments?: AssignmentDetail[];
  affectedCharacterName?: string;
  affectedCharacterClass?: string;
  newCharacterName?: string;
  newCharacterClass?: string;
  isPending: boolean;
  onTransfer: () => void;
  onClearAssignments: () => void;
  onCancel: () => void;
}

export function CharacterReplacementDialog({
  open,
  onOpenChange,
  existingAssignments,
  affectedCharacterName,
  affectedCharacterClass,
  newCharacterName,
  newCharacterClass,
  isPending,
  onTransfer,
  onClearAssignments,
  onCancel,
}: CharacterReplacementDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>
            Replacing{" "}
            <span
              className={
                affectedCharacterClass
                  ? (CLASS_TEXT_COLORS[affectedCharacterClass] ??
                    "text-foreground")
                  : "text-foreground"
              }
            >
              {affectedCharacterName ?? "character"}
            </span>
            {newCharacterName && (
              <>
                {" "}
                with{" "}
                <span
                  className={
                    newCharacterClass
                      ? (CLASS_TEXT_COLORS[newCharacterClass] ??
                        "text-foreground")
                      : "text-foreground"
                  }
                >
                  {newCharacterName}
                </span>
              </>
            )}
            ...
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                <span
                  className={`font-semibold ${affectedCharacterClass ? (CLASS_TEXT_COLORS[affectedCharacterClass] ?? "text-foreground") : "text-foreground"}`}
                >
                  {affectedCharacterName ?? "This character"}
                </span>{" "}
                has the following assignments:
              </p>
              {(() => {
                const groupAssignments = existingAssignments?.filter(
                  (a) => a.type === "encounter-group",
                );
                const aaAssignments = existingAssignments?.filter(
                  (a) => a.type === "aa",
                );
                const hasGroups =
                  groupAssignments && groupAssignments.length > 0;
                const hasAA = aaAssignments && aaAssignments.length > 0;

                if (hasGroups && hasAA) {
                  return (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="mb-1 font-medium">Group Assignments</p>
                        <ul className="list-inside list-disc">
                          {groupAssignments.map((a, i) => (
                            <li key={i} className="whitespace-nowrap">
                              {a.encounterName} ({a.slotName})
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="mb-1 font-medium">AA Assignments</p>
                        <ul className="list-inside list-disc">
                          {aaAssignments.map((a, i) => (
                            <li key={i} className="whitespace-nowrap">
                              {a.encounterName} ({a.slotName})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="text-sm">
                    <p className="mb-1 font-medium">
                      {hasGroups ? "Group Assignments" : "AA Assignments"}
                    </p>
                    <ul className="list-inside list-disc">
                      {existingAssignments?.map((a, i) => (
                        <li key={i} className="whitespace-nowrap">
                          {a.encounterName} ({a.slotName})
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              <p>What would you like to do?</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel disabled={isPending} onClick={onCancel}>
            Cancel
          </AlertDialogCancel>
          {newCharacterName && (
            <AlertDialogAction onClick={onTransfer} disabled={isPending}>
              Transfer to {newCharacterName}
            </AlertDialogAction>
          )}
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
