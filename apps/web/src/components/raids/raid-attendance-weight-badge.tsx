"use client";

import {Badge} from "~/components/ui/badge";
import {Tooltip, TooltipTrigger} from "~/components/ui/tooltip";
import {TooltipContent} from "@radix-ui/react-tooltip";

const trackedRaidTooltipContent = (
  <span>
    Tracked raids give attendance credit, which is needed to SR certain BiS items from Naxxramas.
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
        attendanceWeight == 0.5 ? (
          <Badge variant="secondary" className="bg-primary-foreground text-primary">Half Credit</Badge>
        ) : (
          <Badge variant="default">Full Credit</Badge>
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
