"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";

interface AddEncounterDialogProps {
  planId: string;
  onEncounterCreated?: () => void;
}

export function AddEncounterDialog({
  planId,
  onEncounterCreated,
}: AddEncounterDialogProps) {
  const [open, setOpen] = useState(false);
  const [encounterName, setEncounterName] = useState("");
  const { toast } = useToast();

  const createMutation = api.raidPlan.createEncounter.useMutation({
    onSuccess: (data) => {
      toast({
        title: "Encounter created",
        description: `"${data.encounterName}" has been added.`,
      });
      setEncounterName("");
      setOpen(false);
      onEncounterCreated?.();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!encounterName.trim()) return;
    createMutation.mutate({ planId, encounterName: encounterName.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-9 px-2">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Add Encounter</DialogTitle>
            <DialogDescription>
              Create a new encounter tab to configure custom group assignments.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="encounter-name">Encounter Name</Label>
              <Input
                id="encounter-name"
                placeholder="e.g., Razorgore, Vaelastrasz"
                value={encounterName}
                onChange={(e) => setEncounterName(e.target.value)}
                autoComplete="off"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!encounterName.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
