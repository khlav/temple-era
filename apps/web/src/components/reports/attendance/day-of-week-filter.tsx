"use client";

import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Calendar } from "lucide-react";

const DAYS_OF_WEEK = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
] as const;

export function DayOfWeekFilter({
  selectedDays,
  onDaysChange,
}: {
  selectedDays: string[]; // day values like "monday", "tuesday", etc.
  onDaysChange: (days: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localSelectedDays, setLocalSelectedDays] =
    useState<string[]>(selectedDays);

  // Sync local state when selectedDays prop changes (from outside)
  useEffect(() => {
    setLocalSelectedDays(selectedDays);
  }, [selectedDays]);

  // Apply changes when dropdown closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Dropdown is closing - apply the local changes
      onDaysChange(localSelectedDays);
    }
    setOpen(newOpen);
  };

  // Update local state when toggling (don't apply to parent yet)
  const handleToggleDay = (day: string, checked: boolean) => {
    if (checked) {
      setLocalSelectedDays([...localSelectedDays, day]);
    } else {
      const filtered = localSelectedDays.filter((d) => d !== day);
      setLocalSelectedDays(filtered);
    }
  };

  const displayText =
    selectedDays.length === 0
      ? "All Days"
      : selectedDays.length === 7
        ? "All Days"
        : selectedDays.length === 1
          ? (DAYS_OF_WEEK.find((d) => d.value === selectedDays[0])?.label ??
            "Days")
          : `Days (${selectedDays.length})`;

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Calendar className="mr-2 h-4 w-4" />
          {displayText}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {DAYS_OF_WEEK.map(({ value, label }) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={localSelectedDays.includes(value)}
            onCheckedChange={(checked) => handleToggleDay(value, checked)}
            onSelect={(e) => e.preventDefault()} // Prevent closing on select
          >
            {label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
