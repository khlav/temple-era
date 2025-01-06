"use client";

import {FormEvent, useEffect} from "react";
import {useState} from "react";
import {api} from "~/trpc/react";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import {
  Raid,
  RaidLogCollection,
  RaidLog,
  RaidParticipantCollection,
  RaidParticipant,
} from "~/server/api/interfaces/raid";

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
  "7ZWXfHARy2MKgFLn",
];

export function CreateRaid() {
  const [reportIdUrl, setReportIdUrl] = useState<string>("");
  const [submittedReportId, setSubmittedReportId] = useState<string>("");
  const [raidLogs, setRaidLogs] = useState<RaidLogCollection>({});

  const [customWeightVisible, setCustomWeightVisible] = useState(false);

  // const { mutate: saveRaid, isPending: isSaving } = api.raid.insertRaidLogWithAttendees.useMutation({
  //   onSuccess: () => {
  //     alert("Success!! Raid Log and Attendees imported.");
  //   },
  //   onError: (error) => {
  //     alert(`Error saving raid: ${error.message}`);
  //   },
  // });

  // const handleSave = () => {
  //   if (raidReport) {
  //     saveRaid({
  //       raidLogId: raidReport.logId,
  //       name: raidReport.title,
  //       raidId: undefined,
  //       kills: raidReport.kills,
  //       startTimeUTC: raidReport.startTimeUTC,
  //       endTimeUTC: raidReport.endTimeUTC,
  //       createdVia: 'wcl_raid_log_import',
  //       participants: raidReport.participants
  //     });
  //
  //   }
  // };

  const {
    data: wclReport,
    isLoading,
    isError,
    error,
  } = api.wcl.getRaidById.useQuery(
    { id: submittedReportId },
    { enabled: !!submittedReportId } // Fetch only if a reportId is submitted,
  );

  // useEffect(() => {
  //   if (isSuccess) {
  //     setRaidLogs(prevState => {
  //       return {
  //         ...prevState,
  //         [wclReport.raidLogId]: wclReport,
  //       } as RaidLogCollection;
  //     })
  //     console.log(raidLogs);
  //   }}, [isSuccess, wclReport,raidLogs]);


const sampleRaids = (
  <div className="pt-5 text-xs text-slate-400">
    <div>Sample links:</div>
    {exampleRaidLogIds.slice(0, 5).map((raidId: string) => (
      <div key={raidId}>
        https://vanilla.warcraftlogs.com/reports/{raidId}
      </div>
    ))}
  </div>
);

const handleReportIdInputChange = (value: string) => {
  const reportIdRegex = /([a-zA-Z0-9]{16})/;
  const match = reportIdRegex.exec(value);

  setReportIdUrl(value);

  if (match) {
    setSubmittedReportId(match[1] ?? "");
  } else {
  }
};

const {title, raidLogId, startTimeUTC, endTimeUTC, zone, kills, participants} =
wclReport ?? {
  title: "",
  raidLogId: "",
  startTimeUTC: "",
  endTimeUTC: "",
  zone: "",
  kills: [],
  participants: [],
};

const now = new Date(startTimeUTC);

const day = ("0" + now.getDate()).slice(-2);
const month = ("0" + (now.getMonth() + 1)).slice(-2);

const dateVal = now.getFullYear() + "-" + month + "-" + day;

const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setCustomWeightVisible(e.target.value === "custom");
};

return (
  <div>
    <div className={!!submittedReportId && !isLoading ? "hidden" : ""}>
      <div>Create new Raid event from WCL log:</div>
      <input
        type="text"
        placeholder="e.g. https://vanilla.warcraftlogs.com/reports/bmThXYVCxyFPARta"
        value={reportIdUrl}
        onChange={(e) => handleReportIdInputChange(e.target.value)}
        className="w-full rounded border border-gray-300 px-4 py-2 disabled:text-slate-400 sm:max-w-lg"
        disabled={isLoading}
      />
      {isLoading && (
        <svg
          className="ml-2 inline-block animate-spin text-gray-300"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
        >
          <path
            d="M32 3C35.8083 3 39.5794 3.75011 43.0978 5.20749C46.6163 6.66488 49.8132 8.80101 52.5061 11.4939C55.199 14.1868 57.3351 17.3837 58.7925 20.9022C60.2499 24.4206 61 28.1917 61 32C61 35.8083 60.2499 39.5794 58.7925 43.0978C57.3351 46.6163 55.199 49.8132 52.5061 52.5061C49.8132 55.199 46.6163 57.3351 43.0978 58.7925C39.5794 60.2499 35.8083 61 32 61C28.1917 61 24.4206 60.2499 20.9022 58.7925C17.3837 57.3351 14.1868 55.199 11.4939 52.5061C8.801 49.8132 6.66487 46.6163 5.20749 43.0978C3.7501 39.5794 3 35.8083 3 32C3 28.1917 3.75011 24.4206 5.2075 20.9022C6.66489 17.3837 8.80101 14.1868 11.4939 11.4939C14.1868 8.80099 17.3838 6.66487 20.9022 5.20749C24.4206 3.7501 28.1917 3 32 3L32 3Z"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          ></path>
          <path
            d="M32 3C36.5778 3 41.0906 4.08374 45.1692 6.16256C49.2477 8.24138 52.7762 11.2562 55.466 14.9605C58.1558 18.6647 59.9304 22.9531 60.6448 27.4748C61.3591 31.9965 60.9928 36.6232 59.5759 40.9762"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-blue-500"
          ></path>
        </svg>
      )}
      {sampleRaids}
    </div>
    {isError && (
      <div className="w-full text-center text-red-500">
        Error: {error.message}
      </div>
    )}

    {wclReport && (
      <div>
        <div className="mt-8">
          <div className="space-y-8 p-4">
            {/* Raid Detail Input */}
            <div className="mx-auto max-w-xl rounded-lg p-6 shadow-md">
              <form>
                <div className="mb-4">
                  <label
                    htmlFor="raidName"
                    className="block text-sm font-medium "
                  >
                    Raid Name
                  </label>
                  <input
                    type="text"
                    id="raidName"
                    name="raidName"
                    value={wclReport?.title ?? ""}
                    disabled={true}
                    className="mt-1 block w-full rounded-md border-gray-300 p-2 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    placeholder="Enter raid name"
                  />
                </div>

                <div className="mb-4">
                  <div className="mt-2 flex items-center space-x-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="attendanceWeightType"
                        value="attendance"
                        defaultChecked={true}
                        className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        onChange={handleWeightChange}
                      />
                      <span className="ml-2 text-sm ">
                          Attendance Raid
                        </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="attendanceWeightType"
                        value="optional"
                        className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        onChange={handleWeightChange}
                      />
                      <span className="ml-2 text-sm ">
                          Optional Raid
                        </span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        name="attendanceWeightType"
                        value="custom"
                        className="border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        id="customWeightRadio"
                        onChange={handleWeightChange}
                      />
                      <span className="ml-2 text-sm ">
                          Custom
                        </span>
                    </label>
                    {customWeightVisible ? (
                      <input
                        type="number"
                        id="customWeightInput"
                        name="customWeight"
                        defaultValue={1}
                        min={0}
                        max={1}
                        step={0.1}
                        className="ml-4 w-16 rounded-md p-2 shadow-sm shadow-gray-400 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      />
                    ) : (
                      <></>
                    )}
                  </div>
                </div>

                <div className="mb-4">
                  <label
                    htmlFor="raidDate"
                    className="block text-sm font-medium "
                  >
                    Date
                  </label>
                  <input
                    type="date"
                    id="raidDate"
                    name="raidDate"
                    value={dateVal}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    disabled={true}
                  />
                </div>

                <div className="mt-6">
                  <button
                    type="submit"
                    className="w-full rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                    onClick={(e) => {
                      e.preventDefault();
                    }}
                  >
                    Submit
                  </button>
                </div>
              </form>
            </div>
            {/* General Information */}
            <div className="rounded-md p-6 shadow-md ">
              <h2 className="mb-4 text-lg font-bold ">
                WCL Raid Report Info
              </h2>
              <p>
                <strong>Title:</strong> {title}
              </p>
              <p>
                <strong>Log ID:</strong> {raidLogId}
              </p>
              <p>
                <strong>Zone:</strong> {zone}
              </p>
              <p>
                <strong>Start Time:</strong>{" "}
                {new Date(startTimeUTC).toLocaleString()}
              </p>
              <p>
                <strong>End Time:</strong>{" "}
                {new Date(endTimeUTC).toLocaleString()}
              </p>
              <div className="mt-4">
                <h3 className="font-semibold ">
                  Kills:
                </h3>
                <ul className="list-inside list-disc">
                  {kills.map((kill, index) => (
                    <li key={index}>{kill}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Participants Table */}
            <div className="rounded-md p-6 shadow-md">
              <h2 className="mb-4 text-lg font-bold ">
                Participants
              </h2>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y  border  text-left text-sm">
                  <thead className="">
                  <tr>
                    <th className="px-4 py-2 font-semibold ">
                      Name
                    </th>
                    <th className="px-4 py-2 font-semibold ">
                      Class
                    </th>
                    <th className="px-4 py-2 font-semibold ">
                      Class Detail
                    </th>
                    <th className="px-4 py-2 font-semibold ">
                      Server
                    </th>
                  </tr>
                  </thead>
                  <tbody>
                  {Object.values(participants)
                    .sort((a, b) => (a.name > b.name ? 1 : -1))
                    .map((participant) => (
                      <tr
                        key={participant.characterId}
                        className=""
                      >
                        <td className="px-4 py-2">{participant.name}</td>
                        <td className="px-4 py-2">{participant.class}</td>
                        <td className="px-4 py-2">
                          {participant.classDetail}
                        </td>
                        <td className="px-4 py-2">{participant.server}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <LabeledArrayCodeBlock label="Result" value={wclReport}/>
      </div>
    )}
  </div>
);
}
