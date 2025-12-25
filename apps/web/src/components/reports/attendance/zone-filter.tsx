"use client";

import { useState, useEffect } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Filter } from "lucide-react";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";

export function ZoneFilter({
  selectedZones,
  onZonesChange,
}: {
  selectedZones: string[]; // instance identifiers
  onZonesChange: (zones: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [localSelectedZones, setLocalSelectedZones] =
    useState<string[]>(selectedZones);

  // Sync local state when selectedZones prop changes (from outside)
  useEffect(() => {
    setLocalSelectedZones(selectedZones);
  }, [selectedZones]);

  // Apply changes when dropdown closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Dropdown is closing - apply the local changes
      if (localSelectedZones.length > 0) {
        onZonesChange(localSelectedZones);
      }
    }
    setOpen(newOpen);
  };

  // Update local state when toggling (don't apply to parent yet)
  const handleToggleZone = (instance: string, checked: boolean) => {
    if (checked) {
      setLocalSelectedZones([...localSelectedZones, instance]);
    } else {
      const filtered = localSelectedZones.filter((z) => z !== instance);
      // Always allow at least one zone to be selected
      if (filtered.length > 0) {
        setLocalSelectedZones(filtered);
      }
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <Filter className="mr-2 h-4 w-4" />
          Zones ({selectedZones.length})
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {RAID_ZONE_CONFIG.map(({ instance, name }) => (
          <DropdownMenuCheckboxItem
            key={instance}
            checked={localSelectedZones.includes(instance)}
            onCheckedChange={(checked) => handleToggleZone(instance, checked)}
            onSelect={(e) => e.preventDefault()} // Prevent closing on select
          >
            {name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
