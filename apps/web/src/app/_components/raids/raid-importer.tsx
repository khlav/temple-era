"use client";

import type {FormEvent } from "react";
import { useState} from "react";
import { api } from "~/trpc/react";
import LabeledArrayCodeBlock from "~/app/_components/misc/codeblock";

const exampleRaidLogIds = [
  "kY1KV3jMgPzQaXFW",
  "d3YDbmJq9RGtpPMj",
  "TBPp7gZ8Ykdv3Cr1",
  "dWL8TKrRFD9jkvAb",
  "vVw7CH2RDc6tn4Pb",
  "QVZXDM9nKNaLjfPx",
  "rpJ3jtXmPqMNhL81",
  "yn7VY84KDafrhFPp",
  "byWJx1B2aktT4LvY",
  "FmTwZbLk1DzpXtaV",
  "fDCkmVWt13yq2MnT",
  "adV1MKF679pnGPm3",
  "j8ZcW1JbwyKLh9t3",
  "RxWDhBzdr7nbVyqX",
  "arbvm6xd2cAn4LpB",
  "np2HyNDchrzG81Ym",
  "7xWaZzjrctXP9n1C",
  "KjfZ4Dx7XwYgHcJ1",
  "VW9hBDH4KnR6Gb2L",
  "Q7bFpdjTPWzGaD86",
  "CvaKJDgMjL3F7d4r",
  "pnVZMhCjqDFAvP8B",
  "RCryH836NQK4kXdL",
  "JQXAn9wDHLvVNrjp",
  "ypnv8YamdkVzxHKF",
  "9XZcr7QLkJpwF8hA",
  "bmThXYVCxyFPARta",
  "Vt7KbqwBvpY3A46X",
  "nh4aD893WLdfNBvT",
  "7ZWXfHARy2MKgFLn"
];

const randomRaidLogId = exampleRaidLogIds[Math.floor(Math.random() * exampleRaidLogIds.length)] ?? "";

// function LabeledValueBlock({ label, value }: { label: string; value: string }) {
//   return (
//     <div className="mb-4">
//       <strong>{label}:</strong>
//       <p>{value}</p>
//     </div>
//   );
// }

export function RaidImporter() {
  const [reportId, setReportId] = useState<string>(randomRaidLogId);  // RANDOM RAID LOG ID SELECTED HERE
  const [submittedReportId, setSubmittedReportId] = useState<string>("");

  const { mutate: saveRaid, isPending: isSaving } = api.raid.insertRaidLogWithAttendees.useMutation({
    onSuccess: () => {
      alert("Success!! Raid Log and Attendees imported.");
    },
    onError: (error) => {
      alert(`Error saving raid: ${error.message}`);
    },
  });

  const {
    data: raidReport,
    isLoading,
    isError,
    error,
  } = api.wcl.getRaidById.useQuery(
    { id: submittedReportId },
    { enabled: !!submittedReportId } // Fetch only if a reportId is submitted
  );

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmittedReportId(reportId);
  };

  const handleSave = () => {
    if (raidReport) {
      saveRaid({
        raidLogId: raidReport.raidLogId,
        name: raidReport.title,
        raidId: undefined,
        kills: raidReport.kills,
        startTimeUTC: raidReport.startTimeUTC,
        endTimeUTC: raidReport.endTimeUTC,
        createdVia: 'wcl_raid_log_import',
        participants: raidReport.participants
      });

    }
  };

  return (
    <div>
      <form
        onSubmit={handleSubmit}
        className="mb-8 flex items-center space-x-4"
      >
        <input
          type="text"
          placeholder="Enter Report ID"
          value={reportId}
          onChange={(e) => setReportId(e.target.value)}
          className="border border-gray-300 rounded px-4 py-2 w-full sm:max-w-xs"
        />
        <button
          type="submit"
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Fetch Raid Log
        </button>
      </form>

      {isLoading && (
        <div className="w-full flex justify-center items-center">
          <p>Loading...</p>
        </div>
      )}

      {isError && (
        <div className="w-full text-center text-red-500">
          Error: {error.message}
        </div>
      )}

      {raidReport && (
        <div>
          <div className="mt-8">
            <button
              onClick={handleSave}
              className={`w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 ${
                isSaving ? "opacity-50 cursor-not-allowed" : ""
              }`}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Import Raid Log"}
            </button>
          </div>
        <LabeledArrayCodeBlock label="Result" value={raidReport} />
        </div>

  )
}
</div>
)
  ;
}
