"use client";
import {api} from "~/trpc/react";
import Link from "next/link";
import LabeledArrayCodeBlock from "~/app/ui/misc/codeblock";
import UserAvatar from "~/app/ui/nav/user-avatar";

export function RaidList() {
  const {data: raids, isLoading, isError, error} = api.raid.getRaids.useQuery();

  return (
    <div>
      {isLoading && (
        <div className="flex w-full items-center justify-center">
          <p>Loading...</p>
        </div>
      )}

      {isError && (
        <div className="w-full text-center text-red-500">
          Error: {error.message}
        </div>
      )}

      {raids && (
        <div>
          <table className="min-w-full table-auto border-collapse rounded-lg border border-gray-300 shadow-sm">
            <thead>
              <tr className="bg-gray-100 text-sm uppercase leading-normal text-gray-600">
                <th className="border-b border-gray-200 px-6 py-3 text-left">
                  Name
                </th>
                <th className="border-b border-gray-200 px-6 py-3 text-left">
                  Raid ID
                </th>
                <th className="border-b border-gray-200 px-6 py-3 text-left">
                  Date
                </th>
                <th className="border-b border-gray-200 px-6 py-3 text-left">
                  Attendance Weight
                </th>
                <th className="border-b border-gray-200 px-6 py-3 text-left">
                  Created By
                </th>
              </tr>
            </thead>
            <tbody>
              {raids.map((raid) => (
                <tr
                  key={raid.raidId}
                  className="border-b border-gray-200 hover:bg-gray-50"
                >
                  <td className="px-6 py-3 text-gray-800">
                    <Link
                      href={`/raids/${raid.raidId}`}
                      className="inline-block rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
                    >
                      {raid.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-gray-800">{raid.raidId}</td>
                  <td className="px-6 py-3 text-gray-800">
                    {new Date(raid.date).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-gray-800">
                    {raid.attendanceWeight}
                  </td>
                  <td className="px-6 py-3 text-gray-800">
                    <UserAvatar
                      name={raid.creator?.name ?? ""}
                      image={raid.creator?.image ?? ""}
                      extraInfo={raid.creator?.character?.name ?? undefined}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-8">
            <LabeledArrayCodeBlock label="Raids" value={raids} />
          </div>
        </div>
      )}
    </div>
  );
}
