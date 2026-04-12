"use client";

import { formatDistanceToNow } from "date-fns";
import { Button } from "~/components/ui/button";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { formatRaidDay, formatRaidTime } from "~/utils/date-formatting";

interface PastPlan {
  id: string;
  name: string;
  zoneId: string;
  createdAt: Date;
  startAt: Date | null;
  lastModifiedAt: Date;
  lastEditor: {
    id: string;
    name: string | null;
    image: string | null;
  } | null;
  raidHelperEventId: string;
}

interface PastPlansTableProps {
  plans: PastPlan[] | undefined;
}

export function PastPlansTable({ plans }: PastPlansTableProps) {
  if (!plans || plans.length === 0) {
    return (
      <div className="rounded-md border py-8 text-center text-muted-foreground">
        No past plans found.
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
            <th className="h-10 px-2 text-left align-middle font-medium text-muted-foreground">
              Plans ({plans.length})
            </th>
            <th className="hidden h-10 px-2 text-left align-middle font-medium text-muted-foreground lg:table-cell lg:w-[220px]">
              Last Edited
            </th>
            <th className="hidden h-10 px-2 text-center align-middle font-medium text-muted-foreground md:table-cell md:w-[60px]">
              Link
            </th>
          </tr>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {plans.map((plan) => {
            let dateStr = "";
            let timeStr = "";

            if (plan.startAt) {
              dateStr = formatRaidDay(plan.startAt);
              timeStr = formatRaidTime(plan.startAt);
            }

            const lastEditedText = plan.lastEditor?.name
              ? `Last edited by ${plan.lastEditor.name} ${formatDistanceToNow(
                  new Date(plan.lastModifiedAt),
                  { addSuffix: true },
                )}`
              : `Last updated ${formatDistanceToNow(
                  new Date(plan.lastModifiedAt),
                  { addSuffix: true },
                )}`;

            return (
              <tr
                key={plan.id}
                className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                <td className="w-[1px] whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-20"
                    asChild
                  >
                    <Link href={`/raid-manager/raid-planner/${plan.id}`}>
                      View Plan
                    </Link>
                  </Button>
                </td>
                <td className="w-full p-2 align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                  <div className="min-w-0">
                    <div className="truncate">{plan.name}</div>
                    <div className="truncate text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {dateStr}
                      {timeStr ? ` • ${timeStr}` : ""}
                    </div>
                    <div className="truncate text-xs font-normal text-muted-foreground lg:hidden">
                      {lastEditedText}
                    </div>
                  </div>
                </td>
                <td className="hidden p-2 align-middle lg:table-cell">
                  <div className="truncate text-xs font-normal text-muted-foreground">
                    {lastEditedText}
                  </div>
                </td>
                <td className="hidden p-2 text-center align-middle md:table-cell [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href={`https://raid-helper.dev/event/${plan.raidHelperEventId}`}
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
          })}
        </tbody>
      </table>
    </div>
  );
}
