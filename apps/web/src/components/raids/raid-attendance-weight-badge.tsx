"use client";

import {Badge} from "~/components/ui/badge";
import {Tooltip, TooltipTrigger} from "~/components/ui/tooltip";
import {TooltipContent} from "@radix-ui/react-tooltip";
import {
  TRACKED_RAID_LABEL__FULL_CREDIT,
  TRACKED_RAID_LABEL__HALF_CREDIT,
  TRACKED_RAID_LABEL__NO_CREDIT
} from "~/constants";

const trackedRaidTooltipContent = (
  <span>
    50%+ raid attendance credit is needed to SR certain Naxxramas items.
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
          <Badge
            variant="secondary"
            className="bg-primary-foreground text-primary"
          >
            {TRACKED_RAID_LABEL__HALF_CREDIT}
          </Badge>
        ) : (
          <Badge variant="default">{TRACKED_RAID_LABEL__FULL_CREDIT}</Badge>
        )
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          {TRACKED_RAID_LABEL__NO_CREDIT}
        </Badge>
      )}
    </TooltipTrigger>
    <TooltipContent>
      <div className="mb-0.5 rounded-lg bg-muted px-3 py-1 text-center text-sm text-muted-foreground shadow transition-all">
        {attendanceWeight > 0
          ? trackedRaidTooltipContent
          : optionalRaidTooltipContent}
      </div>
    </TooltipContent>
  </Tooltip>
);
