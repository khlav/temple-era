"use client";

import {RaidLogLoader} from "~/components/raids/raidlog-loader";
import {useState} from "react";
import {
  EmptyRaid,
  type Raid,
  type RaidLog,
} from "~/server/api/interfaces/raid";
import {useToast} from "~/hooks/use-toast";
import {RaidEditor} from "~/components/raids/raid-editor";
import {api} from "~/trpc/react";
import {useRouter} from "next/navigation";
import {
  toastRaidLogInUse,
  toastRaidLogLoaded,
  toastRaidSaved,
} from "~/components/raids/raid-toasts";

const getDefaultAttendanceWeight = (zoneName: string) => {
  const attendanceWeightedZones = {
    "Naxxramas": 1,
    "Temple of Ahn'Qiraj": 1,
    "Blackwing Lair": 1,
    "Molten Core": 0.5,
  } as const;  // Make the object immutable

  return (
    attendanceWeightedZones[zoneName as keyof typeof attendanceWeightedZones] ?? 0
  );
};

export function CreateRaid() {
  const router = useRouter();
  const utils = api.useUtils();

  const {toast} = useToast();
  const [raidData, setRaidData] = useState<Raid>(EmptyRaid());
  const [needsInitialRaidLog, setNeedsInitialRaidLog] = useState<boolean>(true);
  const [sendingData, setSendingData] = useState<boolean>(false);

  const createRaid = api.raid.insertRaid.useMutation({
    onError: (error) => {
      alert(error.message);
      setSendingData(false);
    },
    onSuccess: async (result) => {
      toastRaidSaved(toast, raidData, result.raid?.raidId ?? -1, true);
      await utils.invalidate(undefined, {refetchType: "all"});
      router.push("/raids");
    },
  });

  const handleInitialRaidLog = (initialRaidLog: RaidLog | undefined) => {
    console.log(initialRaidLog);
    if (initialRaidLog) {
      if (initialRaidLog.raidId) {
        toastRaidLogInUse(toast, initialRaidLog);
      } else {
        const raidDate = new Date(initialRaidLog.startTimeUTC);
        const approxServerUTCOffsetInHours = 5;
        raidDate.setHours(raidDate.getHours() - approxServerUTCOffsetInHours);

        setRaidData((raidData) => ({
          ...raidData,

          raidId: undefined,
          name: initialRaidLog.name,
          date: raidDate.toISOString().split("T")[0] ?? "",
          zone: initialRaidLog.zone ?? "",
          attendanceWeight: getDefaultAttendanceWeight(initialRaidLog.zone),
          kills: initialRaidLog.kills ?? [],
          raidLogIds: [initialRaidLog.raidLogId],
        }));

        setNeedsInitialRaidLog(false);

        toastRaidLogLoaded(toast, initialRaidLog);
      }
    }
  };

  const handleClear = () => {
    setRaidData(EmptyRaid());
    setNeedsInitialRaidLog(true);
  };

  const handleSubmitAction = () => {
    setSendingData(true);

    createRaid.mutate({
      name: raidData.name,
      date: raidData.date,
      zone: raidData.zone,
      attendanceWeight: raidData.attendanceWeight,
      raidLogIds: raidData.raidLogIds ?? [],
      bench: raidData.bench,
    });
  };

  return (
    <>
      <div className="pb-4 text-3xl font-bold">Create new raid event</div>
      {needsInitialRaidLog ? (
        <RaidLogLoader onDataLoaded={handleInitialRaidLog}/>
      ) : (
        ""
      )}
      {!needsInitialRaidLog && (
        <>
          <RaidEditor
            raidData={raidData}
            setRaidDataAction={setRaidData}
            isSendingData={sendingData}
            editingMode="new"
            handleSubmitAction={handleSubmitAction}
            handleDeleteAction={handleClear}

          />
        </>
      )}
    </>
  );
}
