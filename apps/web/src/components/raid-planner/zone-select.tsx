"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  RAID_ZONE_CONFIG,
  CUSTOM_ZONE_ID,
  CUSTOM_ZONE_DISPLAY_NAME,
} from "~/lib/raid-zones";
import { TWENTY_MAN_INSTANCES } from "./constants";
import { cn } from "~/lib/utils";

interface ZoneSelectProps {
  value?: string;
  onValueChange: (value: string) => void;
  className?: string; // Allow overriding trigger width/className
}

export function ZoneSelect({
  value,
  onValueChange,
  className,
}: ZoneSelectProps) {
  const itemClassName = "text-xs py-1 cursor-pointer";

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("h-9", className ?? "w-[180px]")}>
        <SelectValue placeholder="Select zone..." />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel className="text-xs font-semibold text-muted-foreground">
            40-Man Raids
          </SelectLabel>
          {(["mc", "bwl", "aq40", "naxxramas"] as const).map((instance) => {
            const config = RAID_ZONE_CONFIG.find(
              (z) => z.instance === instance,
            );
            return config ? (
              <SelectItem
                key={instance}
                value={instance}
                className={itemClassName}
              >
                {config.name}
              </SelectItem>
            ) : null;
          })}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel className="text-xs font-semibold text-muted-foreground">
            20-Man Raids
          </SelectLabel>
          {TWENTY_MAN_INSTANCES.map((instance) => {
            const config = RAID_ZONE_CONFIG.find(
              (z) => z.instance === instance,
            );
            return config ? (
              <SelectItem
                key={instance}
                value={instance}
                className={itemClassName}
              >
                {config.name}
              </SelectItem>
            ) : null;
          })}
        </SelectGroup>
        <SelectSeparator />
        <SelectItem
          value={CUSTOM_ZONE_ID}
          className={cn("italic text-muted-foreground", itemClassName)}
        >
          {CUSTOM_ZONE_DISPLAY_NAME}
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
