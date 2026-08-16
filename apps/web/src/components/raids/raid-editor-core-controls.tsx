"use client";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
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

const EYEBROW_CLASSNAME =
  "font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground";

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
  handleInputChangeAction?: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  handleWeightChangeAction?: (e: FormEvent<HTMLButtonElement>) => void;
  handleSubmitAction: () => void;
  handleDeleteAction: () => void;
  debug?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 grow md:min-w-[220px]">
          <Label htmlFor="name" className={EYEBROW_CLASSNAME}>
            Raid Name
          </Label>
          <Input
            id="name"
            name="name"
            type="text"
            value={raidData.name}
            onChange={handleInputChangeAction}
            autoComplete="off"
            className="mt-1.5"
          />
        </div>
        <div className="w-full sm:w-[190px] sm:shrink-0 sm:grow-0">
          <Label htmlFor="zone" className={EYEBROW_CLASSNAME}>
            Zone
          </Label>
          <Select
            value={raidData.zone}
            onValueChange={(value) =>
              handleInputChangeAction?.({
                target: { name: "zone", value },
              } as unknown as ChangeEvent<HTMLSelectElement>)
            }
          >
            <SelectTrigger
              id="zone"
              className="mt-1.5 h-10 rounded-xl border-input/85 bg-card/70 text-base md:text-sm"
            >
              <SelectValue placeholder="Select a zone" />
            </SelectTrigger>
            <SelectContent>
              {RAID_ZONES.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-[160px] sm:shrink-0 sm:grow-0">
          <Label htmlFor="date" className={EYEBROW_CLASSNAME}>
            Event Date
          </Label>
          <Input
            id="date"
            name="date"
            type="date"
            value={raidData.date}
            onChange={handleInputChangeAction}
            autoComplete="off"
            className="mt-1.5"
          />
          <div className="mt-1 text-center text-xs text-muted-foreground">
            {PrettyPrintDate(new Date(raidData.date), true)}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col items-stretch gap-1.5 sm:w-32 sm:items-end">
          <Label className={EYEBROW_CLASSNAME}>&nbsp;</Label>
          <Button className="w-full" onClick={handleSubmitAction} disabled={isSendingData}>
            {isSendingData ? (
              <Loader className="animate-spin" />
            ) : editingMode === "existing" ? (
              "Save raid"
            ) : (
              "Create raid"
            )}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="text-xs text-destructive/80 transition-colors hover:text-destructive"
              >
                {editingMode === "existing" ? "Delete raid" : "Reset"}
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  Raid info will be lost. <br />
                  Logs and characters will be hidden until they are used elsewhere.
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

      <div className="flex flex-wrap items-center gap-4 border-t border-border/60 pt-3">
        <div className={EYEBROW_CLASSNAME}>Attendance Tracking</div>
        <RadioGroup
          id="attendanceWeight"
          value={raidData.attendanceWeight.toString()}
          defaultValue="0"
          orientation="horizontal"
          className="flex space-x-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="option-one" value="1" onClick={handleWeightChangeAction} />
            <Label htmlFor="option-one">
              <RaidAttendenceWeightBadge attendanceWeight={1} />
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="option-half" value="0.5" onClick={handleWeightChangeAction} />
            <Label htmlFor="option-half">
              <RaidAttendenceWeightBadge attendanceWeight={0.5} />
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem id="option-zero" value="0" onClick={handleWeightChangeAction} />
            <Label htmlFor="option-zero">
              <RaidAttendenceWeightBadge attendanceWeight={0} />
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
