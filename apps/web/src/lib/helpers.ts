import { buildReportUrl } from "@temple-era/wcl";
import type { RaidParticipant } from "~/server/api/interfaces/raid";

/** Kept as a named re-export so the many existing call sites do not have to change. */
export const GenerateWCLReportUrl = (reportId: string) => buildReportUrl(reportId);

export const PrettyPrintDate = (date: Date, withWeekday?: boolean) =>
  date.toLocaleDateString("en-US", {
    timeZone: "UTC",
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
