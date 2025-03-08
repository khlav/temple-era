"use client";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import type { Raid } from "~/server/api/interfaces/raid";
import { Loader } from "lucide-react";
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
import type { ChangeEvent, FormEvent } from "react";
import { PrettyPrintDate } from "~/lib/helpers";

export function RaidEditorCoreControls({
  raidData,
  isSendingData,
  editingMode = "new",
  handleInputChangeAction,
  handleWeightChangeAction,
  handleSubmitAction,
  handleDeleteAction,
}: {
  raidData: Raid;
  isSendingData: boolean;
  editingMode: "new" | "existing";
  handleInputChangeAction?: (e: ChangeEvent<HTMLInputElement>) => void;
  handleWeightChangeAction?: (e: FormEvent<HTMLButtonElement>) => void;
  handleSubmitAction: () => void;
  handleDeleteAction: () => void;
  debug?: boolean;
}) {
  return (
    <>
      <div className="flex gap-4">
        <div className="grow whitespace-nowrap">
          <Label htmlFor="wclUrl">Raid Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            value={raidData.name}
            onChange={handleInputChangeAction}
            autoComplete="off"
          />
        </div>
        <div className="grow-0">
          <Label htmlFor="wclUrl">Event Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={raidData.date}
            onChange={handleInputChangeAction}
            autoComplete="off"
          />
          <div className="text-center text-xs text-muted-foreground">
            {PrettyPrintDate(new Date(raidData.date), true)}
          </div>
        </div>
        <div className="my-auto w-28 grow-0 text-center">
          <Button
            className="mb-2 w-full"
            onClick={handleSubmitAction}
            disabled={isSendingData}
          >
            {isSendingData ? (
              <Loader className="animate-spin" />
            ) : editingMode === "existing" ? (
              "Save raid"
            ) : (
              "Create raid"
            )}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger>
              <span className="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground rounded bg-red-950 px-2 py-1 text-xs transition-colors">
                {editingMode === "existing" ? "Delete raid" : "Reset"}
              </span>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Raid info will be lost. <br />
                  Logs and characters will be hidden until they are used
                  elsewhere.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-red-800 hover:bg-blend-lighten"
                  onClick={handleDeleteAction}
                >
                  Yes, delete raid information
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="flex gap-4 pt-2 lg:pt-0">
        <div className="grow">
          <RadioGroup
            id="attendanceWeight"
            value={raidData.attendanceWeight.toString()}
            defaultValue="0"
            orientation="horizontal"
            className="flex space-x-4"
          >
            <div className="flex text-sm">Attendance Tracking:</div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="1" onClick={handleWeightChangeAction} />
              <Label htmlFor="option-one">Full Credit</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="0.5" onClick={handleWeightChangeAction} />
              <Label htmlFor="option-one">Half Credit</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="0" onClick={handleWeightChangeAction} />
              <Label htmlFor="option-two">Optional</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </>
  );
}
