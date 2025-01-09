"use client";

import { RaidLogLoader } from "~/components/raids/raidlog-loader";
import { useState } from "react";
import {
  EmptyRaid,
  type Raid,
  type RaidLog, RaidParticipant,
} from "~/server/api/interfaces/raid";
import { type toast as toastType, useToast } from "~/hooks/use-toast";
import { RaidEditor } from "~/components/raids/raid-editor";

const toastLogLoaded = (toast: typeof toastType, raidLog: RaidLog) => {
  toast({
    title: "Raid log loaded",
    description: (
      <>
        <div className="text-primary font-bold">{raidLog.name}</div>
        <div>
          {Object.keys(raidLog.participants).length} attendees,{" "}
          {raidLog.kills.length} kills
        </div>
        <div className="text-muted-foreground">ID : {raidLog.raidLogId}</div>
      </>
    ),
  });
};

const getDefaultAttendanceWeight = (zoneName: string) => {
  const attendanceWeightedZones = [
    "Naxxramas",
    "Temple of Ahn'Qiraj",
    "Blackwing Lair",
  ]; // All other zones default to Optional (weight = 0)
  return attendanceWeightedZones.includes(zoneName) ? 1 : 0;
};

export function CreateRaid() {
  const { toast } = useToast();
  const [raidData, setRaidData] = useState<Raid>(EmptyRaid());
  const [needsInitialRaidLog, setNeedsInitialRaidLog] = useState<boolean>(true);

  const handleInitialRaidLog = (initialRaidLog: RaidLog | null) => {
    if (initialRaidLog) {
      const raidDate = new Date(initialRaidLog.startTimeUTC);
      const approxServerUTCOffsetInHours = 5;
      raidDate.setHours(raidDate.getHours() - approxServerUTCOffsetInHours);

      setRaidData((raidData) => ({
        ...raidData,

        raidId: null,
        name: initialRaidLog.name,
        date: raidDate.toISOString().split("T")[0] ?? "",
        zone: initialRaidLog.zone ?? "",
        attendanceWeight: getDefaultAttendanceWeight(initialRaidLog.zone),
        raidLogIds: [initialRaidLog.raidLogId],
      }));

      setNeedsInitialRaidLog(false);

      toastLogLoaded(toast, initialRaidLog);
    }
  };

  const handleClear = () => {
    setRaidData(EmptyRaid());
    setNeedsInitialRaidLog(true);
  };

  const handleGenericInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRaidData((raidData) => ({
      ...raidData,
      [e.target.name]: e.target.value,
    }))
  };

  const handleWeightChange = (e: React.FormEvent<HTMLButtonElement>) => {
    setRaidData((raidData) => ({
      ...raidData,
      // @ts-expect-error Value exists, but IDE says not found
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      attendanceWeight: parseInt(e.target.value) ?? 0,
    }))
  };

  const handleSubmitAction = () => {
    console.log(raidData)
  }

  const handleBenchSelect = (character: RaidParticipant) => {
    setRaidData((raidData) => ({
      ...raidData,
      bench: {
        ...raidData.bench,
        [character.characterId]: character
      }
    }))
  }

  const handleBenchRemove = (character: RaidParticipant) => {
    // console.log(character)
    const newBench = raidData.bench ?? {};
    delete newBench[character.characterId.toString()];
    console.log(newBench)

    setRaidData((raidData) => ({
      ...raidData,
      bench: newBench
    }))
  }

  return (
    <>
      <div className="pb-4 text-3xl font-bold">Create new raid event</div>
      {needsInitialRaidLog ? (
        <RaidLogLoader onDataLoaded={handleInitialRaidLog} />
      ) : (
        ""
      )}
      {!needsInitialRaidLog && (
        <>
          <RaidEditor
            raidData={raidData}
            handleInputChangeAction={handleGenericInputChange}
            handleWeightChangeAction={handleWeightChange}
            handleSubmitAction={handleSubmitAction}
            handleClearAction={handleClear}
            handleBenchSelectAction={handleBenchSelect}
            handleBenchRemoveAction={handleBenchRemove}
            debug
          />
        </>
      )}
    </>
  );
}
