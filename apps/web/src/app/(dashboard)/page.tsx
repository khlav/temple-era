import React from "react";
import LabeledArrayCodeBlock from "~/components/misc/codeblock";
import { AttendanceDashboard } from "~/components/dashboard/attendance-dashboard";
import { Separator } from "~/components/ui/separator";
import { auth } from "~/server/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <main className="w-full px-4">
      <div className="mb-4 text-3xl font-bold tracking-tight">
        Raid Attendance{" "}
        <span className="text-muted-foreground pl-2 text-lg font-normal tracking-normal">
              Last six complete lockout weeks
            </span>
      </div>
      {session?.user?.isAdmin ? (
        <>
          <Separator className="mb-3"/>
          <div className="text-primary font-bold">Admin Only - Raw Data</div>
          <div>
            <AttendanceDashboard/>
          </div>
        </>
      ) : (
        <></>
      )}
    </main>
  );
}
