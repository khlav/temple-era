"use client";

import { useEffect, useRef } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { api } from "~/trpc/react";

interface PushDefaultAADialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planId: string;
  onConfirm: () => void;
  isPushing: boolean;
}

export function PushDefaultAADialog({
  open,
  onOpenChange,
  planId,
  onConfirm,
  isPushing,
}: PushDefaultAADialogProps) {
  const previewMutation = api.raidPlan.pushDefaultAAAssignments.useMutation();

  // Fire preview when dialog opens
  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current) {
      previewMutation.mutate({ raidPlanId: planId, preview: true });
    }
    prevOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId]);

  const previewData = previewMutation.data;
  const isLoading = previewMutation.isPending;
  const hasEncounters = (previewData?.encounters.length ?? 0) > 0;
  const hasOverwrites =
    previewData?.encounters.some((e) => e.slotsWithExisting > 0) ?? false;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Push Default AA Assignments</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Copy the Default/Trash AA slot assignments to all encounters
                with matching slot names.
              </p>

              {isLoading && (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing encounters...
                </div>
              )}

              {previewData && !hasEncounters && (
                <p className="text-sm text-muted-foreground">
                  No encounters have matching AA slot names. Make sure
                  encounters have AA templates enabled with slots that match the
                  default template.
                </p>
              )}

              {previewData && hasEncounters && (
                <TooltipProvider delayDuration={200}>
                  <div className="rounded-md border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-3 py-1.5 text-left font-medium">
                            Encounter
                          </th>
                          <th className="px-3 py-1.5 text-right font-medium">
                            Slots
                          </th>
                          <th className="px-3 py-1.5 text-right font-medium">
                            Overwrites
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.encounters.map((enc) => (
                          <tr
                            key={enc.encounterId}
                            className="border-b last:border-0"
                          >
                            <td className="px-3 py-1.5">{enc.encounterName}</td>
                            <td className="px-3 py-1.5 text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="cursor-default border-b border-dotted border-muted-foreground/50">
                                    {enc.matchingSlotCount}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="left"
                                  className="bg-secondary text-muted-foreground"
                                >
                                  <div className="space-y-0.5">
                                    {enc.matchingSlots.map((slot) => (
                                      <div key={slot}>{slot}</div>
                                    ))}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              {enc.slotsWithExisting > 0 ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex cursor-default items-center gap-1 border-b border-dotted border-amber-500/50 text-amber-500">
                                      <AlertTriangle className="h-3 w-3" />
                                      {enc.slotsWithExisting}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="left"
                                    className="bg-secondary text-muted-foreground"
                                  >
                                    <div className="space-y-0.5">
                                      {enc.overwrites.map((ow) => (
                                        <div key={ow.slotName}>
                                          {ow.slotName}:{" "}
                                          {ow.characterNames.join(", ")}
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {hasOverwrites && (
                    <p className="flex items-start gap-1.5 text-sm font-medium text-amber-500">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      Some encounter slots already have assignments that will be
                      replaced.
                    </p>
                  )}
                </TooltipProvider>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPushing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPushing || isLoading || !hasEncounters}
          >
            {isPushing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Pushing...
              </>
            ) : (
              `Push to ${previewData?.encounters.length ?? 0} Encounter${(previewData?.encounters.length ?? 0) !== 1 ? "s" : ""}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
