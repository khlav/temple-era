"use client";

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
            <th
              colSpan={2}
              className="h-10 px-2 text-left align-middle font-medium text-muted-foreground"
            >
              Plans ({plans.length})
            </th>
            <th className="h-10 w-auto px-2 text-left align-middle font-medium text-muted-foreground md:w-3/12">
              Date
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

            return (
              <tr
                key={plan.id}
                className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
              >
                <td className="w-[1px] whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-[90px]"
                    asChild
                  >
                    <Link href={`/raid-manager/raid-planner/${plan.id}`}>
                      View Plan
                    </Link>
                  </Button>
                </td>
                <td className="p-2 align-middle font-medium [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                  {plan.name}
                </td>
                <td className="whitespace-nowrap p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]">
                  <div className="flex flex-col md:flex-row md:gap-1">
                    <span>{dateStr}</span>
                    <span className="hidden md:inline">•</span>
                    <span className="text-muted-foreground">{timeStr}</span>
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
