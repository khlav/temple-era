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
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { RAID_ZONES } from "~/lib/raid-zones";
import { cn } from "~/lib/utils";

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
  handleInputChangeAction?: (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => void;
  handleWeightChangeAction?: (e: FormEvent<HTMLButtonElement>) => void;
  handleSubmitAction: () => void;
  handleDeleteAction: () => void;
  debug?: boolean;
}) {
  return (
    <>
      <div className="flex flex-wrap gap-4">
        <div className="min-w-0 grow whitespace-nowrap md:min-w-[200px]">
          <Label htmlFor="name">Raid Name</Label>
          <Input
            id="name"
            name="name"
            type="text"
            value={raidData.name}
            onChange={handleInputChangeAction}
            autoComplete="off"
          />
        </div>
        <div className="flex w-full gap-4 md:w-auto md:min-w-[200px] md:flex-none md:grow-0">
          <div className="w-1/2 md:min-w-[200px] md:grow-0">
            <Label htmlFor="zone">Zone</Label>
            <select
              id="zone"
              name="zone"
              value={raidData.zone}
              onChange={handleInputChangeAction}
              className={cn(
                "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
              )}
              autoComplete="off"
            >
              <option value="">Select a zone</option>
              {RAID_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
          <div className="w-1/2 md:grow-0">
            <Label htmlFor="date">Event Date</Label>
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
        </div>
        <div className="w-full text-center md:my-auto md:w-28 md:grow-0">
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
              <span className="rounded bg-red-950 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground">
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
              <RadioGroupItem
                id="option-one"
                value="1"
                onClick={handleWeightChangeAction}
              />
              <Label htmlFor="option-one">
                <RaidAttendenceWeightBadge attendanceWeight={1} />
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                id="option-half"
                value="0.5"
                onClick={handleWeightChangeAction}
              />
              <Label htmlFor="option-half">
                <RaidAttendenceWeightBadge attendanceWeight={0.5} />
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                id="option-zero"
                value="0"
                onClick={handleWeightChangeAction}
              />
              <Label htmlFor="option-zero">
                <RaidAttendenceWeightBadge attendanceWeight={0} />
              </Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </>
  );
}
