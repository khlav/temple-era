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
