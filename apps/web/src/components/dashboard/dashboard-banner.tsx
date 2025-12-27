"use client";

import { Card, CardContent, CardHeader } from "~/components/ui/card";
import Link from "next/link";
import React from "react";
import type { Session } from "next-auth";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { ChevronDown, InfoIcon } from "lucide-react";

export default function DashboardBanner({ session }: { session?: Session }) {
  const loot_prio_url =
    "https://docs.google.com/spreadsheets/d/1OBcFgT1AXiPL3eW7x3yUx6EjsopPLlFMclph2OGRkXU/edit?gid=0#gid=0";
  const raid_policy_channel_url =
    "https://discord.com/channels/1132586324264759390/1194046879508480100";

  // Default to expanded for unauthenticated users, collapsed for logged-in users
  const defaultOpen = !session?.user;

  const [isOpen, setIsOpen] = React.useState(defaultOpen);

  return (
    <div className="pb-2">
      <Card className="text-sm">
        <Collapsible
          open={isOpen}
          onOpenChange={setIsOpen}
          defaultOpen={defaultOpen}
        >
          <CollapsibleTrigger asChild>
            <CardHeader
              className={`cursor-pointer p-4 transition-colors hover:bg-muted/50 ${
                isOpen ? "pb-0" : ""
              }`}
            >
              <div className="flex flex-row items-center gap-2">
                <div className="grow-0 font-bold text-primary">
                  Please Read <InfoIcon className="inline h-4 w-4" /> Temple
                  Raid Attendance & Loot Policy
                </div>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <div className="text-muted-foreground">
                <div>
                  Raiders must maintain 50%+ large raid attendance over 6
                  lockout weeks to roll on{" "}
                  <Link
                    href={loot_prio_url}
                    target="_blank"
                    className="text-secondary-foreground hover:underline"
                  >
                    specific Naxx gear
                  </Link>
                  .
                </div>
                <div>
                  In practice, this means raiders must participate in ~1.5
                  different 40-player raids (in different zones) on average each
                  week to stay eligible.
                </div>
                <div className="pt-2">
                  Note: If a raid is full, you can earn credit by being
                  ready/available at raid time and contacting an officer.
                </div>
                <div>
                  <Link
                    className="text-blue-500 hover:text-secondary-foreground hover:underline"
                    href={raid_policy_channel_url}
                    target="_blank"
                  >
                    Learn more in Discord:{" "}
                    <strong>Temple &gt; #raid-policies</strong>
                  </Link>
                </div>
                {/*<div className="pt-2">*/}
                {/*  <strong>How it works: </strong>*/}
                {/*  Raiders earn up to three (3) raid credits per week toward*/}
                {/*  attendance.*/}
                {/*</div>*/}
                {/*<ul className="list-disc pl-6">*/}
                {/*  <li>*/}
                {/*    AQ40, Naxx, and BWL each grant +1 credit (max once per zone per*/}
                {/*    week)*/}
                {/*  </li>*/}
                {/*  <li>MC grants +1/2 credit (max once per week)</li>*/}
                {/*</ul>*/}
                {/*<div className="pt-2">*/}
                {/*  Your % attendance over 6 weeks is your total credits divided by 18*/}
                {/*  (3 per week, 6 weeks).*/}
                {/*</div>*/}
                {/*<div className="text-xs italic pt-2">*/}
                {/*  Note: Alts count towards your overall attendance as a player. Check the{" "}*/}
                {/*  <Link*/}
                {/*    href="/characters"*/}
                {/*    className="text-secondary-foreground hover:underline"*/}
                {/*  >*/}
                {/*    players*/}
                {/*  </Link>{" "}*/}
                {/*  list for raiding character associations, and talk to an officer for updates.*/}
                {/*</div>*/}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    </div>
  );
}
