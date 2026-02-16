"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/trpc/react";
import {
  Loader2,
  UserPlus,
  Check,
  Armchair,
  Scale,
  Clock,
  UserMinus,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { SignupVolumeIndicator } from "~/components/raid-planner/signup-volume-indicator";
import { Button } from "~/components/ui/button";
import type { Session } from "next-auth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";

interface UpcomingEventsProps {
  session?: Session;
}

interface ScheduledEvent {
  id: string;
  title: string;
  displayTitle: string;
  channelName: string;
  signUpCount: number;
  roleCounts: {
    Tank: number;
    Healer: number;
    Melee: number;
    Ranged: number;
  };
  serverId: string;
  channelId: string;
  userSignupStatus: string | null;
}

// Discord icon SVG component
function DiscordIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function UpcomingEvents({ session }: UpcomingEventsProps) {
  const { data: events, isLoading } =
    api.raidHelper.getScheduledEvents.useQuery(
      {
        allowableHoursPastStart: 2,
      },
      {
        enabled: !!session,
        staleTime: 30 * 1000, // Cache expires after 30 seconds
        refetchOnWindowFocus: false, // Don't refetch when window regains focus
        refetchInterval: false, // Don't poll in background
      },
    );

  // Sample data for unauthenticated view
  const sampleEvents = React.useMemo(
    () => [
      {
        id: "sample-1",
        title: "Naxxramas (40) - Absolute Zero",
        displayTitle: "Naxxramas (40)",
        channelName: "naxxramas",
        signUpCount: 38,
        roleCounts: { Tank: 2, Healer: 8, Melee: 14, Ranged: 14 },
        serverId: "sample",
        channelId: "sample",
      },
      {
        id: "sample-2",
        title: "Temple of Ahn'Qiraj (40) - Speed Clear",
        displayTitle: "Temple of Ahn'Qiraj (40)",
        channelName: "aq40",
        signUpCount: 42,
        roleCounts: { Tank: 3, Healer: 10, Melee: 15, Ranged: 14 },
        serverId: "sample",
        channelId: "sample",
      },
      {
        id: "sample-3",
        title: "Blackwing Lair (40)",
        displayTitle: "Blackwing Lair (40)",
        channelName: "bwl",
        signUpCount: 25,
        roleCounts: { Tank: 2, Healer: 5, Melee: 10, Ranged: 8 },
        serverId: "sample",
        channelId: "sample",
      },
      {
        id: "sample-4",
        title: "Molten Core (40) - Binding Run",
        displayTitle: "Molten Core (40)",
        channelName: "mc",
        signUpCount: 40,
        roleCounts: { Tank: 2, Healer: 10, Melee: 14, Ranged: 14 },
        serverId: "sample",
        channelId: "sample",
      },
      {
        id: "sample-5",
        title: "Onyxia's Lair (40)",
        displayTitle: "Onyxia's Lair (40)",
        channelName: "onyxia",
        signUpCount: 35,
        roleCounts: { Tank: 2, Healer: 7, Melee: 13, Ranged: 13 },
        serverId: "sample",
        channelId: "sample",
      },
      {
        id: "sample-6",
        title: "Zul'Gurub (20) - Idol Run",
        displayTitle: "Zul'Gurub (20)",
        channelName: "zg",
        signUpCount: 18,
        roleCounts: { Tank: 2, Healer: 4, Melee: 6, Ranged: 6 },
        serverId: "sample",
        channelId: "sample",
      },
    ],
    [],
  );

  const displayEvents = session ? events : sampleEvents;

  return (
    <Card className="relative h-full overflow-hidden">
      <CardHeader className="pb-1">
        <div className="flex items-center gap-1">
          <span>Upcoming Events</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !displayEvents || displayEvents.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No upcoming events found.
          </div>
        ) : (
          <div className="relative">
            <div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-8 px-2 py-1 text-left text-xs">
                      Event Name
                    </TableHead>
                    <TableHead className="h-8 px-2 py-1 text-left text-xs">
                      Signups
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayEvents.map((event) => {
                    return (
                      <TableRow key={event.id} className="group border-b">
                        <TableCell className="px-2 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium">
                              {event.displayTitle || event.title}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            {session && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {(() => {
                                    const eventWithStatus =
                                      event as ScheduledEvent;
                                    if (!eventWithStatus.userSignupStatus) {
                                      return (
                                        <Button
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 cursor-default border-muted-foreground"
                                          asChild
                                        >
                                          <a
                                            href={`https://discord.com/channels/${eventWithStatus.serverId}/${eventWithStatus.channelId}/${eventWithStatus.id}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <UserPlus className="h-4 w-4" />
                                          </a>
                                        </Button>
                                      );
                                    }

                                    const isConfirmed =
                                      eventWithStatus.userSignupStatus ===
                                      "Confirmed";

                                    let Icon = Check;
                                    let iconClass = "text-chart-2";

                                    if (!isConfirmed) {
                                      iconClass = "text-muted-foreground";
                                      if (
                                        eventWithStatus.userSignupStatus ===
                                        "Bench"
                                      )
                                        Icon = Armchair;
                                      else if (
                                        eventWithStatus.userSignupStatus ===
                                        "Tentative"
                                      )
                                        Icon = Scale;
                                      else if (
                                        eventWithStatus.userSignupStatus ===
                                        "Late"
                                      )
                                        Icon = Clock;
                                      else if (
                                        eventWithStatus.userSignupStatus ===
                                          "Absence" ||
                                        eventWithStatus.userSignupStatus ===
                                          "Absent"
                                      ) {
                                        Icon = UserMinus;
                                        iconClass =
                                          "text-muted-foreground opacity-50";
                                      }
                                    }

                                    return (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 shrink-0 cursor-default"
                                        asChild
                                      >
                                        <a
                                          href={`https://discord.com/channels/${eventWithStatus.serverId}/${eventWithStatus.channelId}/${eventWithStatus.id}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <Icon
                                            className={cn("h-4 w-4", iconClass)}
                                          />
                                        </a>
                                      </Button>
                                    );
                                  })()}
                                </TooltipTrigger>
                                <TooltipContent className="bg-secondary text-muted-foreground">
                                  {(() => {
                                    if (
                                      !(event as ScheduledEvent)
                                        .userSignupStatus
                                    )
                                      return (
                                        <span className="flex items-center gap-1.5">
                                          Sign up via
                                          <DiscordIcon size={14} />
                                        </span>
                                      );
                                    const status = (event as ScheduledEvent)
                                      .userSignupStatus;
                                    return status === "Confirmed"
                                      ? "Signed up"
                                      : status;
                                  })()}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <div className="flex items-center gap-3">
                              <span className="min-w-[2.5ch] text-right text-xs font-bold">
                                {event.signUpCount ?? 0}
                              </span>
                              <SignupVolumeIndicator
                                count={event.signUpCount}
                                title={event.title}
                                channelName={event.channelName}
                                roleCounts={event.roleCounts}
                              />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
