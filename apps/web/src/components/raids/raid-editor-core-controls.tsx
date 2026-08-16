"use client";
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
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
import { RAID_ZONES } from "~/lib/raid-zones";
import { cn } from "~/lib/utils";
import {
  TRACKED_RAID_LABEL__FULL_CREDIT,
  TRACKED_RAID_LABEL__HALF_CREDIT,
  TRACKED_RAID_LABEL__NO_CREDIT,
} from "~/constants";

const FIELD_LABEL_CLASSNAME = "text-sm font-normal text-muted-foreground";

const ATTENDANCE_WEIGHT_OPTIONS = [
  { value: 1, glyph: TRACKED_RAID_LABEL__FULL_CREDIT, label: "Full credit" },
  { value: 0.5, glyph: TRACKED_RAID_LABEL__HALF_CREDIT, label: "Half credit" },
  { value: 0, glyph: TRACKED_RAID_LABEL__NO_CREDIT, label: "Not tracked" },
];

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
          <Label htmlFor="name" className={FIELD_LABEL_CLASSNAME}>
            Raid name
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
          <Label htmlFor="zone" className={FIELD_LABEL_CLASSNAME}>
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
          <Label htmlFor="date" className={FIELD_LABEL_CLASSNAME}>
            Event date
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

        {editingMode === "new" && (
          <div className="flex w-full shrink-0 flex-col items-stretch gap-1.5 sm:w-32 sm:items-end">
            <Label className={FIELD_LABEL_CLASSNAME}>&nbsp;</Label>
            <Button className="w-full" onClick={handleSubmitAction} disabled={isSendingData}>
              {isSendingData ? <Loader className="animate-spin" /> : "Create raid"}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-destructive/80 transition-colors hover:text-destructive"
                >
                  Reset
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
        )}
      </div>

      <div className="border-t border-border/60 pt-4">
        <div className={cn(FIELD_LABEL_CLASSNAME, "mb-2")}>Attendance tracking</div>
        <div className="flex flex-wrap gap-2">
          {ATTENDANCE_WEIGHT_OPTIONS.map((option) => {
            const isActive = raidData.attendanceWeight === option.value;
            return (
              <button
                key={option.value}
                type="button"
                value={option.value}
                onClick={handleWeightChangeAction}
                aria-pressed={isActive}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  isActive
                    ? "border-primary/60 bg-primary/14 text-primary"
                    : "border-border/70 bg-card/60 text-muted-foreground hover:bg-accent/40",
                )}
              >
                <span
                  className={cn(
                    "font-display text-sm font-bold",
                    isActive ? "text-primary" : "text-muted-foreground/80",
                  )}
                >
                  {option.glyph}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Sets how much this raid counts toward every attendee&apos;s 6-lockout attendance.
        </p>
      </div>
    </div>
  );
}
