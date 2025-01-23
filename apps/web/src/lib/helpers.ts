import type {RaidParticipant} from "~/server/api/interfaces/raid";
import anyAscii from "any-ascii";

export const GenerateWCLReportUrl = (reportId: string) =>
  `https://vanilla.warcraftlogs.com/reports/${reportId}`;

export const PrettyPrintDate = (date: Date, withWeekday?: boolean) =>
  date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    weekday: ( withWeekday ? "short" : undefined),
    year: "numeric",
  });

export const SortRaiders = (a: RaidParticipant, b: RaidParticipant) =>
  anyAscii(a.name) > anyAscii(b.name) ? 1 : -1;