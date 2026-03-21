"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import UserAvatar from "~/components/ui/user-avatar";
import { Badge } from "~/components/ui/badge";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import type { Session } from "next-auth";
import { Card, CardContent } from "~/components/ui/card";
import { useIsMobile } from "~/hooks/use-mobile";
import { VirtualizedList } from "~/components/ui/virtualized-list";
import { cn } from "~/lib/utils";

export function RaidsTable({
  raids,
  session,
}: {
  raids: Raid[] | undefined;
  session?: Session;
}) {
  const isMobile = useIsMobile();
  const mobileRaids = raids ?? [];
  const desktopGridClass = session?.user?.isRaidManager
    ? "grid-cols-[44px_minmax(0,3fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_72px]"
    : "grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_72px]";

  return (
    <div className="space-y-3">
      {isMobile ? (
        <VirtualizedList
          items={mobileRaids}
          itemKey={(raid) => raid.raidId ?? `${raid.name}-${raid.date}`}
          estimateItemHeight={148}
          overscan={5}
          className="h-[min(68svh,42rem)] rounded-xl border p-3"
          innerClassName="pr-1"
          emptyState={
            <div className="rounded-xl border px-4 py-8 text-center text-sm text-muted-foreground">
              No raids found.
            </div>
          }
          renderItem={(r) => (
            <div className="pb-3">
              <Card className="overflow-hidden">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{r.zone}</Badge>
                        <RaidAttendenceWeightBadge
                          attendanceWeight={r.attendanceWeight}
                        />
                      </div>
                      <Link
                        className="block text-base font-semibold text-secondary-foreground transition-all hover:text-primary"
                        target="_self"
                        href={`/raids/${r.raidId}`}
                      >
                        <span className="line-clamp-2">{r.name}</span>
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        {PrettyPrintDate(new Date(r.date), true)}
                      </p>
                    </div>
                    {session?.user?.isRaidManager ? (
                      <Link
                        href={`/raids/${r.raidId}/edit`}
                        className="shrink-0 rounded-md border border-border p-2 text-muted-foreground transition-all hover:text-primary"
                        aria-label={`Edit ${r.name}`}
                      >
                        <Edit size={16} />
                      </Link>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
                    <div className="flex min-w-0 items-center gap-2">
                      {r.creator?.name ? (
                        <>
                          <UserAvatar
                            name={r.creator.name}
                            image={r.creator.image}
                          />
                          <span className="truncate">{r.creator.name}</span>
                        </>
                      ) : (
                        <span>Unknown creator</span>
                      )}
                    </div>
                    {(r.raidLogIds ?? []).length > 0 ? (
                      <Link
                        href={GenerateWCLReportUrl(
                          (r.raidLogIds ?? [])[0] ?? "",
                        )}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-sm transition-all hover:text-primary"
                      >
                        <span>WCL</span>
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {(r.raidLogIds ?? []).length}
                        </Badge>
                        <ExternalLinkIcon size={14} />
                      </Link>
                    ) : (
                      <Badge variant="destructive" className="w-fit shrink-0">
                        No logs
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border">
          <div className="border-b bg-background px-4 py-3 text-sm text-muted-foreground">
            Note: Only Tracked raids are considered for attendance restrictions.
          </div>
          <div
            className={cn(
              "grid items-center gap-3 border-b bg-background px-4 py-3 text-sm font-medium text-muted-foreground",
              desktopGridClass,
            )}
          >
            {session?.user?.isRaidManager ? <div /> : null}
            <div>Raids {raids ? `(${raids.length})` : ""}</div>
            <div>Zone</div>
            <div>Date</div>
            <div>Attendance</div>
            <div>Created By</div>
            <div className="text-center">WCL</div>
          </div>
          <VirtualizedList
            items={mobileRaids}
            itemKey={(raid) => raid.raidId ?? `${raid.name}-${raid.date}`}
            estimateItemHeight={61}
            overscan={10}
            className="h-[min(72svh,48rem)]"
            emptyState={
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No raids found.
              </div>
            }
            renderItem={(r) => (
              <div
                className={cn(
                  "grid items-center gap-3 border-b px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50",
                  desktopGridClass,
                )}
              >
                {session?.user?.isRaidManager ? (
                  <Link
                    href={`/raids/${r.raidId}/edit`}
                    className="text-muted-foreground transition-all hover:text-primary"
                    aria-label={`Edit ${r.name}`}
                  >
                    <Edit size={16} />
                  </Link>
                ) : null}
                <div className="min-w-0">
                  <Link
                    className="block truncate text-secondary-foreground transition-all hover:text-primary"
                    target="_self"
                    href={`/raids/${r.raidId}`}
                  >
                    {r.name}
                  </Link>
                  {(r.raidLogIds ?? []).length === 0 ? (
                    <Badge variant="destructive" className="mt-1 w-fit">
                      Error: No logs found
                    </Badge>
                  ) : null}
                </div>
                <div className="truncate">{r.zone}</div>
                <div className="truncate">
                  {PrettyPrintDate(new Date(r.date), true)}
                </div>
                <div>
                  <RaidAttendenceWeightBadge
                    attendanceWeight={r.attendanceWeight}
                  />
                </div>
                <div className="min-w-0">
                  {r.creator?.name ? (
                    <UserAvatar name={r.creator.name} image={r.creator.image} />
                  ) : (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </div>
                <div className="text-center">
                  {(r.raidLogIds ?? []).map((raidLogId) => {
                    const reportUrl = GenerateWCLReportUrl(raidLogId);
                    return (
                      <Link
                        key={raidLogId}
                        href={reportUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group text-sm transition-all hover:text-primary hover:underline"
                      >
                        <ExternalLinkIcon
                          className="ml-1 inline-block align-text-top"
                          size={15}
                        />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
