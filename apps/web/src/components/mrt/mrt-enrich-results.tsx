"use client";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { AlertTriangle } from "lucide-react";
import { cn } from "~/lib/utils";

interface EnrichmentResult {
  position: number;
  name: string;
  enrichedName: string;
  status: "already-complete" | "enriched" | "not-found";
  server: string | null;
}

interface MRTEnrichResultsProps {
  results: EnrichmentResult[];
}

const statusConfig = {
  "already-complete": {
    className: "text-muted-foreground",
  },
  enriched: {
    className: "text-green-600 dark:text-green-400 font-medium",
  },
  "not-found": {
    className: "text-yellow-600 dark:text-yellow-400",
    icon: AlertTriangle,
    tooltip: "Character not found in database. Server could not be added.",
  },
};

function PlayerSlot({ player }: { player: EnrichmentResult }) {
  const config = statusConfig[player.status];
  const Icon = "icon" in config ? config.icon : undefined;
  const tooltip = "tooltip" in config ? config.tooltip : undefined;

  const slotContent = (
    <div className="flex items-center gap-1.5 rounded border px-2 py-1">
      <div className={cn("flex-1 truncate text-sm", config.className)}>
        {player.enrichedName || player.name}
      </div>
      {Icon && (
        <Icon className="h-3.5 w-3.5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" />
      )}
    </div>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{slotContent}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return slotContent;
}

export function MRTEnrichResults({ results }: MRTEnrichResultsProps) {
  // Organize players into 8 groups of 5
  const groups: EnrichmentResult[][] = Array.from({ length: 8 }, () => []);
  for (const result of results) {
    const groupIndex = Math.floor((result.position - 1) / 5);
    if (groupIndex >= 0 && groupIndex < 8) {
      groups[groupIndex]!.push(result);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Raid Composition</h2>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
        {groups.map((groupPlayers, groupIndex) => (
          <Card key={groupIndex} className="overflow-hidden">
            <CardHeader className="px-3 py-2">
              <CardTitle className="text-sm">Group {groupIndex + 1}</CardTitle>
            </CardHeader>
            <CardContent className="px-3 py-2 pt-0">
              <div className="space-y-1">
                {groupPlayers.length > 0 ? (
                  groupPlayers.map((player) => (
                    <PlayerSlot key={player.position} player={player} />
                  ))
                ) : (
                  <div className="py-1 text-center text-sm text-muted-foreground">
                    Empty
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
