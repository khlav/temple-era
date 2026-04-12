"use client";

import { formatDistanceToNow } from "date-fns";
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
  existingPlans:
    | Record<
        string,
        {
          id: string;
          lastModifiedAt: Date;
          lastEditor: {
            id: string;
            name: string | null;
            image: string | null;
          } | null;
        }
      >
    | undefined;
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
            <th className="h-10 w-[1px] px-2 text-left align-middle font-medium text-muted-foreground">
              <span className="sr-only">Action</span>
            </th>
            <th className="h-10 w-[50%] px-2 text-left align-middle font-medium text-muted-foreground">
              Events ({events.length})
            </th>
            <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground lg:table-cell lg:w-[220px]">
              Last Edited
            </th>
            <th className="h-10 w-[50%] px-2 text-left align-middle font-medium text-muted-foreground">
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
              existingPlan={existingPlans?.[event.id]}
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
  existingPlan,
  onFindPlayers,
  onSelect,
}: {
  event: ScheduledEvent;
  existingPlan?: {
    id: string;
    lastModifiedAt: Date;
    lastEditor: {
      id: string;
      name: string | null;
      image: string | null;
    } | null;
  };
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
  const lastEditedText = existingPlan
    ? existingPlan.lastEditor?.name
      ? `Last edited by ${existingPlan.lastEditor.name} ${formatDistanceToNow(
          new Date(existingPlan.lastModifiedAt),
          { addSuffix: true },
        )}`
      : `Last updated ${formatDistanceToNow(
          new Date(existingPlan.lastModifiedAt),
          { addSuffix: true },
        )}`
    : null;

  return (
    <tr className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
      <td className="w-[1px] whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        {existingPlan ? (
          <Button variant="secondary" size="sm" className="w-20" asChild>
            <Link href={`/raid-manager/raid-planner/${existingPlan.id}`}>
              View Plan
            </Link>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-20 border border-dashed text-muted-foreground hover:border-primary hover:text-primary"
            onClick={onSelect}
          >
            Create Plan
          </Button>
        )}
      </td>
      <td className="w-[50%] p-2 align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        <div className="min-w-0">
          <div className="truncate">{event.displayTitle ?? event.title}</div>
          <div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
            {formattedDate} {formattedTime ? `• ${formattedTime}` : ""}
          </div>
          {lastEditedText ? (
            <div className="truncate text-xs font-normal text-muted-foreground lg:hidden">
              {lastEditedText}
            </div>
          ) : null}
        </div>
      </td>
      <td className="hidden p-2 align-middle lg:table-cell">
        {lastEditedText ? (
          <div className="truncate text-xs font-normal text-muted-foreground">
            {lastEditedText}
          </div>
        ) : null}
      </td>
      <td className="w-[50%] p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
        <div className="flex items-center justify-start gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-border/60 px-2 lg:px-2.5"
                onClick={handleFindPlayers}
                disabled={isLoadingFindPlayers}
              >
                {isLoadingFindPlayers ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                <span className="sr-only lg:not-sr-only lg:ml-1.5">
                  Find Gamers
                </span>
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
