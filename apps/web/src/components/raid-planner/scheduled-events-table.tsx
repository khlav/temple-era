"use client";

import { useState } from "react";
import { Button } from "~/components/ui/button";
import { ExternalLink, Loader2, Users } from "lucide-react";
import { api } from "~/trpc/react";
import type { SignupMatchResult } from "~/server/api/routers/raid-helper";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { formatRaidDay, formatRaidTime } from "~/utils/date-formatting";
import {
  SignupVolumeIndicator,
  getSignupStatusColor,
  getRaidTarget,
  type SignupVolumeRoleCounts,
} from "./signup-volume-indicator";

interface ScheduledEvent {
  id: string;
  title: string;
  displayTitle?: string;
  channelName: string;
  startTime: number;
  leaderName: string;
  signUpCount?: number;
  roleCounts?: SignupVolumeRoleCounts;
}

interface ScheduledEventsTableProps {
  events: ScheduledEvent[] | undefined;
  existingPlans: Record<string, string> | undefined; // map eventId -> planId
  onFindPlayers: (
    eventId: string,
    eventTitle: string,
    eventStartTime: number,
    matchResults: SignupMatchResult[],
  ) => void;
  onSelectEvent: (eventId: string) => void; // For creating a plan
}

export function ScheduledEventsTable({
  events,
  existingPlans,
  onFindPlayers,
  onSelectEvent,
}: ScheduledEventsTableProps) {
  if (!events || events.length === 0) {
    return (
      <div className="rounded-md border py-8 text-center text-muted-foreground">
        No scheduled events found.
      </div>
    );
  }

  return (
    <div className="relative w-full">
      <table className="w-full caption-bottom text-sm">
        <thead className="sticky top-0 z-10 border-b bg-background [&_tr]:border-b">
          <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
            <th
              colSpan={2}
              className="h-10 w-1/4 px-2 text-left align-middle font-medium text-muted-foreground md:w-3/12"
            >
              Events ({events.length})
            </th>
            <th className="hidden h-10 w-1/4 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell md:w-2/12">
              Date
            </th>
            <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground md:table-cell">
              Signups
            </th>
            <th className="h-10 px-2 text-center align-middle font-medium text-muted-foreground md:w-[60px]">
              Link
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              existingPlanId={existingPlans?.[event.id]}
              onFindPlayers={onFindPlayers}
              onSelect={() => onSelectEvent(event.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventRow({
  event,
  existingPlanId,
  onFindPlayers,
  onSelect,
}: {
  event: ScheduledEvent;
  existingPlanId?: string;
  onFindPlayers: (
    eventId: string,
    eventTitle: string,
    eventStartTime: number,
    matchResults: SignupMatchResult[],
  ) => void;
  onSelect: () => void;
}) {
  const [isLoadingFindPlayers, setIsLoadingFindPlayers] = useState(false);
  const utils = api.useUtils();

  // Use standardized formatting
  // Note: event.startTime is in seconds (unix timestamp), Date constructor takes ms
  const dateObj = new Date(event.startTime * 1000);
  const formattedDate = formatRaidDay(dateObj);
  const formattedTime = formatRaidTime(dateObj);

  const handleFindPlayers = async () => {
    setIsLoadingFindPlayers(true);
    try {
      // Fetch event details
      const eventDetails = await utils.raidHelper.getEventDetails.fetch({
        eventId: event.id,
      });

      // Prepare signups for matching
      const allSignups = [
        ...eventDetails.signups.assigned,
        ...eventDetails.signups.unassigned,
      ];
      const signupsForMatching = allSignups.map((s) => ({
        userId: s.userId,
        discordName: s.name,
        className: s.className,
        specName: s.specName,
        partyId: s.partyId,
        slotId: s.slotId,
      }));

      // Match signups to characters
      const matchResults =
        await utils.raidHelper.matchSignupsToCharacters.fetch({
          signups: signupsForMatching,
        });

      onFindPlayers(
        event.id,
        eventDetails.event.displayTitle || eventDetails.event.title,
        event.startTime,
        matchResults,
      );
    } finally {
      setIsLoadingFindPlayers(false);
    }
  };

  const target = getRaidTarget(event.title, event.channelName);
  const colors = getSignupStatusColor(event.signUpCount ?? 0, target);

  return (
    <tr className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
      <td className="w-[1px] whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        {existingPlanId ? (
          <Button variant="secondary" size="sm" className="w-[90px]" asChild>
            <Link href={`/raid-manager/raid-planner/${existingPlanId}`}>
              View Plan
            </Link>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-[90px] border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
            onClick={onSelect}
          >
            Create Plan
          </Button>
        )}
      </td>
      <td className="whitespace-nowrap p-2 align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        {event.displayTitle ?? event.title}
      </td>
      <td className="hidden whitespace-nowrap p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        <div className="flex flex-col md:flex-row md:gap-1">
          <span>{formattedDate}</span>
          <span className="hidden md:inline">•</span>
          <span className="text-muted-foreground">{formattedTime}</span>
        </div>
      </td>
      <td className="p-2 align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        <div className="flex items-center justify-start gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7 border-muted-foreground"
                onClick={handleFindPlayers}
                disabled={isLoadingFindPlayers}
              >
                {isLoadingFindPlayers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                <span className="sr-only">Find Gamers</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="whitespace-pre-line rounded bg-secondary px-3 py-1 text-xs text-muted-foreground shadow transition-all"
            >
              Find Gamers
            </TooltipContent>
          </Tooltip>
          <span
            className={`min-w-[2ch] text-right text-sm font-medium ${colors.text}`}
          >
            {event.signUpCount ?? 0}
          </span>
          <SignupVolumeIndicator
            count={event.signUpCount ?? 0}
            title={event.title}
            channelName={event.channelName}
            roleCounts={event.roleCounts}
          />
        </div>
      </td>
      <td className="p-2 text-center align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={`https://raid-helper.dev/event/${event.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
            >
              <ExternalLink className="h-4 w-4" />
              <span className="sr-only">View on Raid-Helper</span>
            </a>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="rounded bg-secondary px-3 py-1 text-xs text-muted-foreground shadow transition-all"
          >
            Raid Helper
          </TooltipContent>
        </Tooltip>
      </td>
    </tr>
  );
}
