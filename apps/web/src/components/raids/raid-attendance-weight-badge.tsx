"use client";

import {Badge} from "~/components/ui/badge";
import {Tooltip, TooltipTrigger} from "~/components/ui/tooltip";
import {TooltipContent} from "@radix-ui/react-tooltip";

const trackedRaidTooltipContent = (
  <span>
    Raiders need 50% tracked raid participation in recent weeks <br/>
    to SR many BiS items from Naxxramas.
  </span>
);
const optionalRaidTooltipContent = "Fun with friends.  Come get some.";

export const RaidAttendenceWeightBadge = ({
                                            attendanceWeight,
                                          }: {
  attendanceWeight: number;
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      {attendanceWeight > 0 ? (
        attendanceWeight < 1 ? (
          <Badge variant="secondary">Tracked (Partial: {attendanceWeight.toFixed(2)}</Badge>
          ): (
          <Badge variant="default">Tracked</Badge>
      )
        ) : (
        <Badge variant="outline" className="text-muted-foreground">
        Optional
        </Badge>
        )}
    </TooltipTrigger>
    <TooltipContent>
      <div
        className="py-1 px-3 transition-all bg-muted rounded-lg shadow text-center mb-0.5 text-sm text-muted-foreground">
        {attendanceWeight > 0
          ? trackedRaidTooltipContent
          : optionalRaidTooltipContent}
      </div>
    </TooltipContent>
  </Tooltip>
);
