"use client";
import { api } from "~/trpc/react";
import Link from "next/link";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import UserAvatar from "~/components/ui/user-avatar";
import { Button } from "~/components/ui/button";

export function RaidList() {
  const {
    data: raids,
    isLoading,
    isError,
    error,
  } = api.raid.getRaids.useQuery();

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
          <table className="min-w-full table-auto border-collapse rounded-lg border shadow-sm">
            <thead>
              <tr className="text-sm uppercase leading-normal">
                <th className="border-b px-6 py-3 text-left">Name</th>
                <th className="border-b px-6 py-3 text-left">Raid ID</th>
                <th className="border-b px-6 py-3 text-left">Date</th>
                <th className="border-b px-6 py-3 text-left">
                  Attendance Weight
                </th>
                <th className="border-b px-6 py-3 text-left">Created By</th>
              </tr>
            </thead>
            <tbody>
              {raids.map((raid) => (
                <tr key={raid.raidId} className="border-b">
                  <td className="px-6 py-3">
                    <Button className="border-accent" asChild>
                      <Link href={`/raids/${raid.raidId}`}>{raid.name}</Link>
                    </Button>
                  </td>
                  <td className="px-6 py-3">{raid.raidId}</td>
                  <td className="px-6 py-3">{raid.date}</td>
                  <td className="px-6 py-3">{raid.attendanceWeight}</td>
                  <td className="px-6 py-3">
                    <UserAvatar
                      name={raid.creator?.name ?? ""}
                      image={raid.creator?.image ?? ""}
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
