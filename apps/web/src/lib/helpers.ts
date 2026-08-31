import { buildReportUrl } from "@temple-era/wcl";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

/** Kept as a named re-export so the many existing call sites do not have to change. */
export const GenerateWCLReportUrl = (reportId: string) => buildReportUrl(reportId);

// Defaults to UTC, not America/New_York — most call sites (raid dates) pass a bare `date` column
// value through `new Date(...)`, which parses as UTC midnight with no real timezone meaning of
// its own; formatting that in ET would shift it back a calendar day. Callers holding a genuine
// instant (a real timestamptz — season boundaries, achievement awardedAt) should pass
// EASTERN_TIMEZONE explicitly so it displays as the calendar day it actually happened on there.
export const PrettyPrintDate = (date: Date, withWeekday?: boolean, timeZone = "UTC") =>
  date.toLocaleDateString("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
    weekday: withWeekday ? "short" : undefined,
    year: "numeric",
  });

export const SortRaiders = (a: RaidParticipant, b: RaidParticipant) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const Reshape1DTo2D = (arr: unknown[], numRecordsPer: number) => {
  const result = [] as (typeof arr)[];
  for (let i = 0; i < arr.length; i += numRecordsPer) {
    result.push(arr.slice(i, i + numRecordsPer));
  }
  return result;
};
