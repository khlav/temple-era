"use client";

import { Copy } from "lucide-react";
import { cn } from "~/lib/utils";
import { WOW_SERVERS } from "./constants";

interface MRTControlsProps {
  onExportMRT: () => void;
  mrtCopied: boolean;
  homeServer: string;
  onHomeServerChange: (server: string) => void;
  disabled?: boolean;
}

export function MRTControls({
  onExportMRT,
  mrtCopied,
  homeServer,
  onHomeServerChange,
  disabled,
}: MRTControlsProps) {
  return (
    <div className="ml-auto flex items-center gap-2">
      <label
        className={cn(
          "text-xs text-muted-foreground",
          disabled && "opacity-40",
        )}
      >
        My server:
      </label>
      <select
        value={homeServer}
        onChange={(e) => onHomeServerChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "h-7 rounded-md border bg-background px-2 text-xs",
          disabled && "opacity-40",
        )}
      >
        <option value="">All servers</option>
        {WOW_SERVERS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onExportMRT}
        disabled={disabled}
        className={cn(
          "h-7 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none",
          disabled && "opacity-40",
        )}
      >
        {mrtCopied ? (
          "Copied!"
        ) : (
          <>
            <Copy className="mr-1 inline h-3 w-3" />
            MRT Group
          </>
        )}
      </button>
    </div>
  );
}
