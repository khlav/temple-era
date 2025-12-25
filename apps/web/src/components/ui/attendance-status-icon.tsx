"use client";

import { Swords, Armchair } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface AttendanceStatusIconProps {
  status: "attendee" | "bench" | null;
  size?: number;
  className?: string;
  iconClassName?: string;
  variant?: "default" | "inline" | "centered";
}

export function AttendanceStatusIcon({
  status,
  size = 20,
  className = "",
  iconClassName = "",
  variant = "default",
}: AttendanceStatusIconProps) {
  if (!status) {
    return null;
  }

  const getIconClassName = () => {
    const classes: string[] = [];

    // Add variant-specific classes
    if (variant === "inline") {
      classes.push("inline");
    }
    if (variant === "centered") {
      classes.push("mx-auto");
    }

    // Add user-provided iconClassName (may include color classes)
    if (iconClassName) {
      classes.push(iconClassName);
    } else {
      // Default colors if not provided
      if (status === "attendee") {
        classes.push("text-chart-2");
      } else {
        // Default bench color to match dashboard
        classes.push("text-chart-2");
      }
    }

    return classes.join(" ").trim();
  };

  const icon =
    status === "attendee" ? (
      <Swords size={size} className={getIconClassName()} />
    ) : (
      <Armchair size={size} className={getIconClassName()} />
    );

  const tooltipContent = status === "attendee" ? "Attended" : "Bench";

  const tooltip = (
    <Tooltip>
      <TooltipTrigger asChild>{icon}</TooltipTrigger>
      <TooltipContent className="bg-secondary text-muted-foreground">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );

  return <div className={className}>{tooltip}</div>;
}
