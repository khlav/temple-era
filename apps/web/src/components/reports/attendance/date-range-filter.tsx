"use client";

import { Button } from "~/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export function DateRangeFilter({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  defaultDateRange,
}: {
  startDate?: string;
  endDate?: string;
  onStartDateChange: (date: string | undefined) => void;
  onEndDateChange: (date: string | undefined) => void;
  defaultDateRange?: { startDate?: string; endDate?: string };
}) {
  // Use default dates when no explicit dates are set
  const effectiveStartDate = startDate || defaultDateRange?.startDate;
  const effectiveEndDate = endDate || defaultDateRange?.endDate;
  const isUsingDefaults = !startDate && !endDate;

  const handleReset = () => {
    onStartDateChange(undefined);
    onEndDateChange(undefined);
  };

  // Parse dates as local to avoid timezone issues (date strings are YYYY-MM-DD format)
  const parseLocalDate = (dateString: string) => {
    return new Date(dateString + "T00:00:00");
  };

  const displayText =
    effectiveStartDate && effectiveEndDate
      ? `${format(parseLocalDate(effectiveStartDate), "EEE, MMM d, yyyy")} - ${format(parseLocalDate(effectiveEndDate), "EEE, MMM d, yyyy")}${isUsingDefaults ? " (Default)" : ""}`
      : "Last 6 complete lockouts (Default)";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="start-date">Start Date</Label>
            <Input
              id="start-date"
              type="date"
              value={effectiveStartDate || ""}
              onChange={(e) => onStartDateChange(e.target.value || undefined)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="end-date">End Date</Label>
            <Input
              id="end-date"
              type="date"
              value={effectiveEndDate || ""}
              onChange={(e) => onEndDateChange(e.target.value || undefined)}
            />
          </div>
          <Button onClick={handleReset} variant="outline" className="w-full">
            Reset to Default (6 lockouts)
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
