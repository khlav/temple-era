"use client";

import type { Raid } from "~/server/api/interfaces/raid";
import Link from "next/link";
import { Edit, ExternalLinkIcon } from "lucide-react";
import UserAvatar from "~/components/ui/user-avatar";
import { ZoneBadge } from "~/components/ui/zone-badge";
import { RaidAttendenceWeightBadge } from "~/components/raids/raid-attendance-weight-badge";
import { GenerateWCLReportUrl, PrettyPrintDate } from "~/lib/helpers";
import type { Session } from "next-auth";
import { Card, CardContent } from "~/components/ui/card";
import { useIsMobile } from "~/hooks/use-mobile";
import { VirtualizedList } from "~/components/ui/virtualized-list";
import { cn } from "~/lib/utils";

export function RaidsTable({ raids, session }: { raids: Raid[] | undefined; session?: Session }) {
  const isMobile = useIsMobile();
  const mobileRaids = raids ?? [];
  const isManager = !!session?.user?.isRaidManager;
  const desktopGridClass = isManager
    ? "grid-cols-[minmax(0,1fr)_96px_168px_92px_60px]"
    : "grid-cols-[minmax(0,1fr)_96px_168px_92px]";

  return (
    <div className="space-y-3">
      {isMobile ? (
        <VirtualizedList
          items={mobileRaids}
          itemKey={(raid) => raid.raidId ?? `${raid.name}-${raid.date}`}
          estimateItemHeight={148}
          overscan={5}
          className="panel-subtle h-[min(68svh,42rem)] rounded-2xl border border-border/70 p-3"
          innerClassName="pr-1"
          emptyState={
            <div className="rounded-2xl border border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
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
                        <ZoneBadge zoneName={r.zone} />
                        <RaidAttendenceWeightBadge attendanceWeight={r.attendanceWeight} />
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
                    {isManager ? (
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
                          <UserAvatar name={r.creator.name} image={r.creator.image} />
                          <span className="truncate">{r.creator.name}</span>
                        </>
                      ) : (
                        <span>Unknown creator</span>
                      )}
                    </div>
                    {(r.raidLogIds ?? []).length > 0 ? (
                      <Link
                        href={GenerateWCLReportUrl((r.raidLogIds ?? [])[0] ?? "")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-display inline-flex shrink-0 items-center gap-1 text-sm font-semibold transition-all hover:text-primary"
                      >
                        {(r.raidLogIds ?? []).length}
                        <ExternalLinkIcon size={14} />
                      </Link>
                    ) : (
                      <span className="shrink-0 text-xs text-muted-foreground/70">No logs</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        />
      ) : (
        <div className="panel-subtle overflow-hidden rounded-2xl border border-border/70">
          <div
            className={cn(
              "grid items-center gap-3 border-b border-border/70 bg-card/80 px-4 py-3 text-xs uppercase tracking-[0.16em] text-muted-foreground",
              desktopGridClass,
            )}
          >
            <div>Raids {raids ? `(${raids.length})` : ""}</div>
            <div>Credit</div>
            <div>Created by</div>
            <div>Logs</div>
            {isManager ? <div /> : null}
          </div>
          <VirtualizedList
            items={mobileRaids}
            itemKey={(raid) => raid.raidId ?? `${raid.name}-${raid.date}`}
            estimateItemHeight={57}
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
                  "grid items-center gap-3 border-b border-border/45 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent/35",
                  desktopGridClass,
                )}
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      className="truncate text-secondary-foreground transition-all hover:text-primary"
                      target="_self"
                      href={`/raids/${r.raidId}`}
                    >
                      {r.name}
                    </Link>
                    <ZoneBadge zoneName={r.zone} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {PrettyPrintDate(new Date(r.date), true)}
                    {(r.raidLogIds ?? []).length === 0 ? (
                      <span className="ml-2 text-destructive/80">No logs found</span>
                    ) : null}
                  </div>
                </div>
                <div>
                  <RaidAttendenceWeightBadge attendanceWeight={r.attendanceWeight} />
                </div>
                <div className="min-w-0">
                  {r.creator?.name ? (
                    <UserAvatar name={r.creator.name} image={r.creator.image} />
                  ) : (
                    <span className="text-muted-foreground">Unknown</span>
                  )}
                </div>
                <div>
                  {(r.raidLogIds ?? []).length > 0 ? (
                    <Link
                      href={GenerateWCLReportUrl((r.raidLogIds ?? [])[0] ?? "")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display inline-flex items-center gap-1 font-semibold transition-all hover:text-primary"
                    >
                      {(r.raidLogIds ?? []).length}
                      <ExternalLinkIcon size={14} />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </div>
                {isManager ? (
                  <Link
                    href={`/raids/${r.raidId}/edit`}
                    className="text-muted-foreground transition-all hover:text-primary"
                    aria-label={`Edit ${r.name}`}
                  >
                    <Edit size={16} />
                  </Link>
                ) : null}
              </div>
            )}
          />
          <div className="border-t border-border/55 px-4 py-2.5 text-xs text-muted-foreground">
            Only tracked raids count toward attendance restrictions.
          </div>
        </div>
      )}
    </div>
  );
}
