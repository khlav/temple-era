"use client";

import React from "react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { api } from "~/trpc/react";
import { Loader2, UserPlus } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  SignupVolumeIndicator,
  getSignupStatusColor,
  getRaidTarget,
} from "~/components/raid-planner/signup-volume-indicator";
import { Button } from "~/components/ui/button";
import type { Session } from "next-auth";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";

interface UpcomingEventsProps {
  session?: Session;
}

export function UpcomingEvents({ session }: UpcomingEventsProps) {
  const { data: events, isLoading } =
    api.raidHelper.getScheduledEvents.useQuery(
      {
        allowableHoursPastStart: 2,
      },
      {
        enabled: !!session,
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
                    const discordLink = `https://discord.com/channels/${event.serverId}/${event.channelId}`;
                    const target = getRaidTarget(
                      event.title,
                      event.channelName,
                    );
                    const colors = getSignupStatusColor(
                      event.signUpCount ?? 0,
                      target,
                    );

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
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 p-1"
                                    asChild
                                  >
                                    <a
                                      href={discordLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label="Signup on Discord"
                                    >
                                      <UserPlus className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="rounded bg-secondary px-3 py-1 text-xs text-muted-foreground shadow transition-all">
                                  Signup via Discord
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <div className="flex items-center gap-3">
                              <span
                                className={`min-w-[2.5ch] text-right text-xs font-bold ${colors.text}`}
                              >
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
