import React from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "~/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface PollingIndicatorProps {
  isPollingActive: boolean;
  activeTooltip?: React.ReactNode;
  inactiveTooltip?: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  onRestartPolling?: () => void;
  className?: string;
}

export function PollingIndicator({
  isPollingActive,
  activeTooltip = "Live",
  inactiveTooltip = "Not Live",
  side = "top",
  onRestartPolling,
  className,
}: PollingIndicatorProps) {
  return (
    <div className={cn("flex h-7 items-center pr-2", className)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => !isPollingActive && onRestartPolling?.()}
              className={cn(
                "group relative flex items-center justify-center rounded-full p-1 transition-colors",
                isPollingActive
                  ? "cursor-default text-primary"
                  : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-label={
                isPollingActive ? "Live Updates Active" : "Polling Suspended"
              }
            >
              {isPollingActive ? (
                <div className="relative">
                  <Wifi className="h-4 w-4 animate-pulse" />
                  <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
                  </span>
                </div>
              ) : (
                <div className="relative">
                  <WifiOff className="h-4 w-4" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-[1px] w-5 rotate-45 bg-muted-foreground group-hover:bg-foreground"></div>
                  </div>
                </div>
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent
            side={side}
            className="dark border-none bg-secondary text-muted-foreground"
          >
            {isPollingActive ? activeTooltip : inactiveTooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
