"use client"
import { Label } from "~/components/ui/label";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import type { Raid } from "~/server/api/interfaces/raid";

export function RaidEditorCoreControls({
  raidData,
  handleInputChangeAction,
  handleWeightChangeAction,
  handleSubmitAction,
  handleClearAction,
}: {
  raidData: Raid;
  handleInputChangeAction?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleWeightChangeAction?: (e: React.FormEvent<HTMLButtonElement>) => void;
  handleSubmitAction: () => void;
  handleClearAction: () => void;
  debug?: boolean;
}) {
  return (
    <>
      <div className="flex gap-4">
        <div className="grow">
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
        </div>
        <div className="my-auto w-28 grow-0 text-center">
          <Button className="mb-2 w-full" onClick={handleSubmitAction}>
            {raidData.raidId ? "Save" : "Create"} Raid
          </Button>
          {handleClearAction && (
            <Button
              size="sm"
              className="bg-red-950"
              variant="destructive"
              onClick={handleClearAction}
            >
              Clear Data
            </Button>
          )}
        </div>
      </div>
      <div className="flex gap-4">
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
              <Label htmlFor="option-one">Tracked Raid</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="0" onClick={handleWeightChangeAction} />
              <Label htmlFor="option-two">Optional Raid</Label>
            </div>
          </RadioGroup>
        </div>
      </div>
    </>
  );
}
