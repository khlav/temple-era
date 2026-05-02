"use client";

import { Users, Zap } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { useToast } from "~/hooks/use-toast";
import { api } from "~/trpc/react";

interface AACarryForwardDialogProps {
  open: boolean;
  sourcePlanId: string;
  targetPlanId: string;
  sourcePlanName: string;
  onComplete: (targetPlanId: string) => void;
}

export function AACarryForwardDialog({
  open,
  sourcePlanId,
  targetPlanId,
  sourcePlanName,
  onComplete,
}: AACarryForwardDialogProps) {
  const { toast } = useToast();

  const { data: preview, isLoading } =
    api.raidPlan.previewAACarryForward.useQuery(
      { sourcePlanId, targetPlanId },
      { enabled: open },
    );

  const applyMutation = api.raidPlan.applyAACarryForward.useMutation({
    onSuccess: (data) => {
      toast({
        title: "AA slots pre-filled",
        description: `${data.slotsCreated} slot assignment${data.slotsCreated === 1 ? "" : "s"} carried forward.`,
      });
      onComplete(targetPlanId);
    },
    onError: (error) => {
      toast({
        title: "Failed to pre-fill slots",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const hasMatches = !isLoading && preview && preview.slotsToFill > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen && !applyMutation.isPending) {
          onComplete(targetPlanId);
        }
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Pre-fill AA Slots
          </DialogTitle>
        </DialogHeader>

        <div className="py-2 text-sm text-muted-foreground">
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ) : hasMatches ? (
            <div className="flex items-start gap-2">
              <Users className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
              <span>
                Found{" "}
                <span className="font-semibold text-foreground">
                  {preview.matchedCharacters} returning raider
                  {preview.matchedCharacters === 1 ? "" : "s"}
                </span>{" "}
                from{" "}
                <span className="font-medium text-foreground">
                  {sourcePlanName}
                </span>{" "}
                —{" "}
                <span className="font-semibold text-foreground">
                  {preview.slotsToFill} AA slot
                  {preview.slotsToFill === 1 ? "" : "s"}
                </span>{" "}
                ready to pre-fill.
              </span>
            </div>
          ) : (
            <p>
              No returning raiders found from{" "}
              <span className="font-medium text-foreground">
                {sourcePlanName}
              </span>
              . AA slots will start empty.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onComplete(targetPlanId)}
            disabled={applyMutation.isPending}
          >
            Skip
          </Button>
          {hasMatches && (
            <Button
              onClick={() =>
                applyMutation.mutate({ sourcePlanId, targetPlanId })
              }
              disabled={applyMutation.isPending}
            >
              {applyMutation.isPending ? "Pre-filling…" : "Pre-fill Slots"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
