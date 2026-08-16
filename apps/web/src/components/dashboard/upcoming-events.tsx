"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent } from "~/components/ui/card";
import { api } from "~/trpc/react";
import {
  Loader2,
  UserPlus,
  Check,
  Armchair,
  Scale,
  Clock,
  UserMinus,
  ExternalLinkIcon,
  Link2Off,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getRaidTarget } from "~/components/raid-planner/signup-volume-indicator";
import { SignupSizeBar } from "~/components/dashboard/signup-size-bar";
import { Button } from "~/components/ui/button";
import type { Session } from "next-auth";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import { Badge } from "~/components/ui/badge";
import {
  ZONE_ACCENT_CLASSES,
  ZONE_BADGE_COMPACT_CLASSES,
  ZONE_BADGE_LABELS,
} from "~/lib/raid-zones";

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
  softresLinks: Array<{ url: string; zoneId: string | null }>;
}

// Discord icon SVG component
function DiscordIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

// SoftRes logo mark (traced from https://legacy.softres.it/img/logo.70f21c31.svg), recolored to
// currentColor so it follows the same muted/hover treatment as the text link it replaces instead
// of carrying its source's white+brown+orange palette, which assumes a colored circular badge
// behind it that this compact table cell doesn't have.
function SoftResIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 725 725" width={size} height={size} className={className} fill="currentColor">
      <path d="M394 274V242C394 237.757 392.314 233.687 389.314 230.686C386.313 227.686 382.243 226 378 226H248.74L268.74 146H314C318.243 146 322.313 144.314 325.314 141.314C328.314 138.313 330 134.243 330 130V114C330 109.757 328.314 105.687 325.314 102.686C322.313 99.6857 318.243 98 314 98L262.5 98C253.578 97.9991 244.913 100.981 237.881 106.471C230.848 111.961 225.853 119.645 223.69 128.3L199.26 226H58C53.7565 226 49.6869 227.686 46.6863 230.686C43.6857 233.687 42 237.757 42 242V274C42 278.243 43.6857 282.313 46.6863 285.314C49.6869 288.314 53.7565 290 58 290H378C382.243 290 386.313 288.314 389.314 285.314C392.314 282.313 394 278.243 394 274ZM305.55 416.22C300.024 405.799 297.452 394.066 298.111 382.289C298.77 370.512 302.636 359.139 309.29 349.4C316.01 339.53 324.36 330.54 333.38 322H80.27L106.05 580.29C106.602 588.376 110.212 595.948 116.147 601.466C122.082 606.985 129.896 610.037 138 610H298C302.745 609.919 307.41 608.771 311.65 606.64C302.738 593.46 297.984 577.91 298 562C298.001 555.029 299.522 548.141 302.458 541.818C305.394 535.495 309.674 529.889 315 525.39C309.22 519.141 304.746 511.799 301.842 503.797C298.938 495.795 297.662 487.293 298.089 478.791C298.515 470.289 300.636 461.958 304.327 454.287C308.017 446.616 313.203 439.759 319.58 434.12C313.872 429.039 309.12 422.976 305.55 416.22Z" />
      <path d="M362 450H650C658.487 450 666.626 453.371 672.627 459.373C678.629 465.374 682 473.513 682 482C682 490.487 678.629 498.626 672.627 504.627C666.626 510.629 658.487 514 650 514H362C353.513 514 345.374 510.629 339.373 504.627C333.371 498.626 330 490.487 330 482C330 473.513 333.371 465.374 339.373 459.373C345.374 453.371 353.513 450 362 450Z" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M334.686 550.686C337.687 547.686 341.757 546 346 546H666C670.243 546 674.313 547.686 677.314 550.686C680.314 553.687 682 557.757 682 562C682 574.73 676.943 586.939 667.941 595.941C658.939 604.943 646.73 610 634 610H378C365.27 610 353.061 604.943 344.059 595.941C335.057 586.939 330 574.73 330 562C330 557.757 331.686 553.687 334.686 550.686ZM361.28 418C335.93 418 321.21 388.73 335.74 367.41C365.21 324.13 430.06 289.93 506 290C581.94 290.07 646.8 324.13 676.26 367.41C690.73 388.73 676.08 418 650.73 418H361.28ZM506 354C514.837 354 522 346.837 522 338C522 329.163 514.837 322 506 322C497.163 322 490 329.163 490 338C490 346.837 497.163 354 506 354ZM426 370C434.837 370 442 362.837 442 354C442 345.163 434.837 338 426 338C417.163 338 410 345.163 410 354C410 362.837 417.163 370 426 370ZM602 354C602 362.837 594.837 370 586 370C577.163 370 570 362.837 570 354C570 345.163 577.163 338 586 338C594.837 338 602 345.163 602 354Z"
      />
    </svg>
  );
}

export function UpcomingEvents({ session }: UpcomingEventsProps) {
  const { data: events, isLoading } = api.raidHelper.getScheduledEvents.useQuery(
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

  const getEventZoneId = (channelName: string | null | undefined) => {
    if (!channelName) return null;
    const normalized = channelName.toLowerCase();
    if (normalized.includes("naxx")) return "naxxramas";
    if (normalized.includes("aq40")) return "aq40";
    if (normalized.includes("bwl")) return "bwl";
    if (normalized.includes("mc")) return "mc";
    if (normalized.includes("zg")) return "zg";
    if (normalized.includes("onyx")) return "onyxia";
    return null;
  };

  const zoneShortLabel = (zoneId: string) => ZONE_BADGE_LABELS[zoneId] ?? zoneId.toUpperCase();

  return (
    <Card className="relative h-full overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div className="font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
          Upcoming events
        </div>
        <Link
          href="/raid-plans"
          className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          Raid plans
        </Link>
      </div>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !displayEvents || displayEvents.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
            No upcoming events found.
          </div>
        ) : (
          <div className="relative max-h-[236px] overflow-y-auto">
            <div>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-display h-8 px-2 py-1 text-left text-[11px] uppercase tracking-[0.14em]">
                      Event
                    </TableHead>
                    <TableHead className="font-display h-8 px-2 py-1 text-left text-[11px] uppercase tracking-[0.14em]">
                      Signups
                    </TableHead>
                    <TableHead className="font-display h-8 px-2 py-1 text-center text-[11px] uppercase tracking-[0.14em]">
                      SoftRes
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
                            {(() => {
                              const zoneId = getEventZoneId(event.channelName);
                              return zoneId ? (
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    ZONE_ACCENT_CLASSES[zoneId],
                                    ZONE_BADGE_COMPACT_CLASSES,
                                  )}
                                >
                                  {zoneShortLabel(zoneId)}
                                </Badge>
                              ) : null;
                            })()}
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            {session && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {(() => {
                                    const eventWithStatus = event as ScheduledEvent;
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
                                      eventWithStatus.userSignupStatus === "Confirmed";

                                    let Icon = Check;
                                    let iconClass = "text-primary";

                                    if (!isConfirmed) {
                                      iconClass = "text-muted-foreground";
                                      if (eventWithStatus.userSignupStatus === "Bench")
                                        Icon = Armchair;
                                      else if (eventWithStatus.userSignupStatus === "Tentative")
                                        Icon = Scale;
                                      else if (eventWithStatus.userSignupStatus === "Late")
                                        Icon = Clock;
                                      else if (
                                        eventWithStatus.userSignupStatus === "Absence" ||
                                        eventWithStatus.userSignupStatus === "Absent"
                                      ) {
                                        Icon = UserMinus;
                                        iconClass = "text-muted-foreground opacity-50";
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
                                          <Icon className={cn("h-4 w-4", iconClass)} />
                                        </a>
                                      </Button>
                                    );
                                  })()}
                                </TooltipTrigger>
                                <TooltipContent className="bg-secondary text-muted-foreground">
                                  {(() => {
                                    if (!(event as ScheduledEvent).userSignupStatus)
                                      return (
                                        <span className="flex items-center gap-1.5">
                                          Sign up via
                                          <DiscordIcon size={14} />
                                        </span>
                                      );
                                    const status = (event as ScheduledEvent).userSignupStatus;
                                    return status === "Confirmed" ? "Signed up" : status;
                                  })()}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            <div className="min-w-[140px] flex-1">
                              <SignupSizeBar
                                count={event.signUpCount ?? 0}
                                target={getRaidTarget(event.title, event.channelName)}
                                roleCounts={event.roleCounts}
                              />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="px-2 py-1.5 text-center">
                          {(() => {
                            const eventWithSoftres = event as ScheduledEvent;
                            const softresLinks = eventWithSoftres.softresLinks;
                            if (softresLinks && softresLinks.length > 0) {
                              return (
                                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                                  {softresLinks.map((link) => {
                                    // A SoftRes link can exist without a resolvable zone (e.g. the
                                    // raid's instance is only described in its free-text note, never
                                    // set in SoftRes's own structured instance field) - still surface
                                    // the link rather than silently dropping it, just with a generic
                                    // label instead of a zone abbreviation.
                                    const label = link.zoneId ? zoneShortLabel(link.zoneId) : "SR";
                                    return (
                                      <Tooltip key={link.url}>
                                        <TooltipTrigger asChild>
                                          <a
                                            href={link.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground hover:text-foreground"
                                          >
                                            <SoftResIcon size={20} />
                                          </a>
                                        </TooltipTrigger>
                                        <TooltipContent className="flex items-center gap-1 bg-secondary text-muted-foreground">
                                          <span>SoftRes.it: {label}</span>
                                          <ExternalLinkIcon size={12} />
                                        </TooltipContent>
                                      </Tooltip>
                                    );
                                  })}
                                </div>
                              );
                            }

                            // No SoftRes link found (neither Raid Helper's own softresId nor a
                            // follow-up scan match) - only known for real events, not sample data,
                            // so gate on session same as the rest of this row's interactive bits.
                            // Still give a path to the registration message, since the SR list
                            // may just be posted somewhere the heuristic didn't catch.
                            if (!session) return null;

                            return (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <a
                                    href={`https://discord.com/channels/${eventWithSoftres.serverId}/${eventWithSoftres.channelId}/${eventWithSoftres.id}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-1 text-muted-foreground hover:text-foreground"
                                  >
                                    <Link2Off className="h-4 w-4" />
                                    <DiscordIcon size={16} />
                                  </a>
                                </TooltipTrigger>
                                <TooltipContent className="bg-secondary text-muted-foreground">
                                  No hard link — check in Discord
                                </TooltipContent>
                              </Tooltip>
                            );
                          })()}
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
