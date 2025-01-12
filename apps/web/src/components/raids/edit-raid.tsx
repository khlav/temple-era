"use client";

import {useEffect, useState} from "react";
import { api } from "~/trpc/react";
import { RaidEditor } from "~/components/raids/raid-editor";
import {EmptyRaid, type Raid} from "~/server/api/interfaces/raid";
import {useRouter} from "next/navigation";
import {toastRaidDeleted, toastRaidSaved} from "~/components/raids/raid-toasts";
import {useToast} from "~/hooks/use-toast";

export function EditRaid({ raidId }: { raidId: number }) {
  const router = useRouter();
  const utils = api.useUtils();
  const {toast} = useToast();

  const [sendingData, setSendingData] = useState(false);
  const [raidData, setRaidData] = useState<Raid>(EmptyRaid());

  const updateRaid = api.raid.updateRaid.useMutation({
    onError: (error) => {
      alert(error.message);
      setSendingData(false);
    },
    onSuccess: async (result) => {
      await utils.invalidate(undefined, { refetchType: "all"});
      toastRaidSaved(toast, raidData, raidId, false);
      router.push(result.raid ? `/raids/${result.raid.raidId}` : "/raids");
    },
  });

  const deleteRaid = api.raid.delete.useMutation({
    onError: (error) => {
      alert(error.message);
      setSendingData(false);
    },
    onSuccess: async () => {
      await utils.invalidate(undefined, { refetchType: "all"});
      toastRaidDeleted(toast, raidData)
      router.push("/raids");
    },
  });

  const handleSubmitAction = () => {
    setSendingData(true);
    updateRaid.mutate({
      raidId: raidData.raidId ?? -1,
      name: raidData.name,
      date: raidData.date,
      zone: raidData.zone,
      attendanceWeight: raidData.attendanceWeight,
      raidLogIds: raidData.raidLogIds ?? [],
      bench: raidData.bench,
    });
  };

  const handleDeleteAction = () => {
    setSendingData(true);
    deleteRaid.mutate(raidData.raidId ?? -1);
  };
  const {
    data: fetchedRaidData,
    isSuccess,
  } = api.raid.getRaidById.useQuery(raidId);

  useEffect(() => {
    if (isSuccess && fetchedRaidData) {
      setRaidData(fetchedRaidData);
    }
  }, [isSuccess, fetchedRaidData]);

  return (
    <div className="px-2">
      {fetchedRaidData ? (
        <RaidEditor
          raidData={raidData}
          setRaidDataAction={setRaidData}
          isSendingData={sendingData}
          editingMode="existing"
          handleSubmitAction={handleSubmitAction}
          handleDeleteAction={handleDeleteAction}
        />
      ) : (
        <div>
          <div></div>
        </div>
      )}
    </div>
  );
}
