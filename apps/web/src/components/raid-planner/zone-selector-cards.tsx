"use client";

import { Card, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";

interface ZoneSelectorCardsProps {
  onZoneSelect: (instance: string) => void;
  onBack: () => void;
}

export function ZoneSelectorCards({
  onZoneSelect,
  onBack,
}: ZoneSelectorCardsProps) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <span className="text-sm text-muted-foreground">
          Select a raid zone
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {RAID_ZONE_CONFIG.map(({ name, instance }) => (
          <Card
            key={instance}
            className="cursor-pointer transition-colors hover:border-primary hover:bg-accent"
            onClick={() => onZoneSelect(instance)}
          >
            <CardHeader className="py-4">
              <CardTitle className="text-base">{name}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
