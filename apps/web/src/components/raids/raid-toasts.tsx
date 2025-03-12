import type { toast as toastType } from "~/hooks/use-toast";
import type { Raid, RaidLog } from "~/server/api/interfaces/raid";
import { Check, Trash, X } from "lucide-react";
import { ToastAction } from "@radix-ui/react-toast";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { PrettyPrintDate } from "~/lib/helpers";
import {
  TRACKED_RAID_LABEL__FULL_CREDIT,
  TRACKED_RAID_LABEL__HALF_CREDIT,
  TRACKED_RAID_LABEL__NO_CREDIT
} from "~/constants";

export const toastRaidLogLoaded = (
  toast: typeof toastType,
  raidLog: RaidLog,
) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <Check className="inline-block pr-1 text-emerald-700" />
        <span>WCL log loaded</span>
      </>
    ),
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

export const toastRaidLogInUse = (
  toast: typeof toastType,
  raidLog: RaidLog,
) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <X className="inline-block pr-1 text-red-700" />
        <span>Raid log in use</span>
      </>
    ),
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
    action: (
      <ToastAction asChild altText="Go">
        {(raidLog.raidId ?? -1) > 0 && (
          <Button asChild>
            <Link href={"/raids/" + raidLog.raidId}>View</Link>
          </Button>
        )}
      </ToastAction>
    ),
  });
};

export const toastRaidSaved = (
  toast: typeof toastType,
  raidData: Raid,
  raidId: number,
  includeAction: boolean,
) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <Check className="inline-block pr-1 text-emerald-700" />
        <span>Raid saved</span>
      </>
    ),
    description: (
      <>
        <div className="text-primary font-bold">{raidData.name}</div>
        <div>
          {raidData.attendanceWeight == 0
            ? TRACKED_RAID_LABEL__NO_CREDIT
            : raidData.attendanceWeight == 1 
              ? TRACKED_RAID_LABEL__FULL_CREDIT
              : raidData.attendanceWeight == 0.5
                ? TRACKED_RAID_LABEL__HALF_CREDIT
                : "Other"}
          {" "}- {PrettyPrintDate(new Date(raidData.date), true)}
        </div>
      </>
    ),
    action: includeAction ? (
      <ToastAction asChild altText="Go">
        {raidId > 0 && (
          <Button asChild>
            <Link href={"/raids/" + raidId}>Go</Link>
          </Button>
        )}
      </ToastAction>
    ) : (
      <></>
    ),
  });
};

export const toastRaidDataCleared = (
  toast: typeof toastType,
  raidData: Raid,
) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <span>Raid data cleared</span>
      </>
    ),
    description: (
      <>
        <div className="text-primary font-bold">{raidData.name}</div>
        <div>
          {raidData.attendanceWeight == 0
            ? TRACKED_RAID_LABEL__NO_CREDIT
            : raidData.attendanceWeight == 1 
              ? TRACKED_RAID_LABEL__FULL_CREDIT
              : raidData.attendanceWeight == 0.5
                ? TRACKED_RAID_LABEL__HALF_CREDIT
                : "Other"}
        </div>
      </>
    ),
  });
};

export const toastRaidDeleted = (toast: typeof toastType, raidData: Raid) => {
  toast({
    // @ts-expect-error Accepts <Element> just fine.  Ignore type safety concern.
    title: (
      <>
        <Trash className="inline-block pr-1 text-red-700" />
        <span>Deleted</span>
      </>
    ),
    description: (
      <>
        <div className="text-primary font-bold">{raidData.name}</div>
        <div>
          {raidData.attendanceWeight == 0
            ? TRACKED_RAID_LABEL__NO_CREDIT
            : raidData.attendanceWeight == 1 
              ? TRACKED_RAID_LABEL__FULL_CREDIT
              : raidData.attendanceWeight == 0.5
                ? TRACKED_RAID_LABEL__HALF_CREDIT
                : "Other"}
        </div>
      </>
    ),
  });
};
