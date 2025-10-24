"use client";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

interface DiscordWarcraftLogsProps {
  onImportUrl: (url: string) => void;
}

export function DiscordWarcraftLogs({ onImportUrl }: DiscordWarcraftLogsProps) {
  const {
    data: wclLogs,
    isLoading,
    isError,
    error,
  } = api.discord.getRecentWarcraftLogs.useQuery();

  if (isLoading) {
    return (
      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">
              Loading Discord messages...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-destructive">
              Failed to load Discord messages: {error?.message}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!wclLogs || wclLogs.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="p-4">
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-muted-foreground">
              No recent Warcraft Logs found in Discord
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <CardContent className="p-4">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">
            Recent Warcraft Logs from Discord
          </h3>
          <p className="text-sm text-muted-foreground">
            Click "Create" to import a log, or view existing raids
          </p>
        </div>

        <div className="space-y-2">
          {wclLogs.map((log) => (
            <div
              key={`${log.messageId}-${log.wclUrl}`}
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-medium">{log.author}</span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(new Date(log.timestamp), {
                      addSuffix: true,
                    })}
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  {log.content}
                </div>
              </div>

              <div className="flex-shrink-0">
                {log.raidId && log.raidName ? (
                  <Link href={`/raids/${log.raidId}`}>
                    <Button variant="outline" size="sm">
                      View Raid
                    </Button>
                  </Link>
                ) : (
                  <Button size="sm" onClick={() => onImportUrl(log.wclUrl)}>
                    Create
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
