"use client";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Clock, Loader } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { useState } from "react";
import UserAvatar from "~/components/ui/user-avatar";

interface DiscordWarcraftLogsProps {
  onImportUrl: (url: string) => void;
}

// Helper function to make WCL URLs clickable in message content
function renderMessageWithClickableLinks(content: string) {
  const wclUrlRegex =
    /https?:\/\/(?:vanilla|classic)\.warcraftlogs\.com\/reports\/([a-zA-Z0-9]{16})(?:[?#].*)?/g;

  const result = [];
  let lastIndex = 0;
  let match;

  while ((match = wclUrlRegex.exec(content)) !== null) {
    // Add text before the URL
    if (match.index > lastIndex) {
      result.push(
        <span key={`text-${lastIndex}`}>
          {content.slice(lastIndex, match.index)}
        </span>,
      );
    }

    // Add the clickable URL
    result.push(
      <a
        key={`link-${match.index}`}
        href={match[0]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800"
      >
        {match[0]}
      </a>,
    );

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text after the last URL
  if (lastIndex < content.length) {
    result.push(
      <span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>,
    );
  }

  return result;
}

export function DiscordWarcraftLogs({ onImportUrl }: DiscordWarcraftLogsProps) {
  const {
    data: wclLogs,
    isLoading,
    isError,
    error,
  } = api.discord.getRecentWarcraftLogs.useQuery();

  const { data: channelInfo, isLoading: channelLoading } =
    api.discord.getChannelInfo.useQuery();

  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="mt-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-muted-foreground">
            Loading Discord messages...
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-destructive">
            Failed to load Discord messages: {error?.message}
          </div>
        </div>
      </div>
    );
  }

  if (!wclLogs || wclLogs.length === 0) {
    return (
      <div className="mt-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-muted-foreground">
            No recent Warcraft Logs found in Discord
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 w-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">
          Found {wclLogs.length} WCL links in{" "}
          {channelInfo ? (
            <a
              href={`https://discord.com/channels/${channelInfo.guildId}/${channelInfo.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              #{channelInfo.name}
            </a>
          ) : (
            <span className="text-muted-foreground">
              {channelLoading ? "Loading..." : "Discord Channel"}
            </span>
          )}{" "}
          <span className="text-xs font-normal italic text-muted-foreground">
            Last 7 days
          </span>
        </h3>
      </div>

      <div className="space-y-2">
        {wclLogs.map((log) => (
          <div
            key={`${log.messageId}-${log.wclUrl}`}
            className={`flex items-center gap-3 py-1 ${
              log.raidId ? "italic text-muted-foreground opacity-40" : ""
            }`}
          >
            <div className="flex-shrink-0">
              {log.raidId && log.raidName ? (
                <Link href={`/raids/${log.raidId}`}>
                  <Button variant="outline" size="sm" className="w-24">
                    View
                  </Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    setLoadingUrl(log.wclUrl);
                    onImportUrl(log.wclUrl);
                  }}
                  disabled={loadingUrl !== null}
                  className="w-24"
                >
                  {loadingUrl === log.wclUrl ? (
                    <Loader className="animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              )}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="grid grid-cols-[auto_auto_auto_1fr] items-center gap-2 text-sm">
                <div className="whitespace-nowrap">
                  {log.websiteUser ? (
                    <UserAvatar
                      name={log.websiteUser.name}
                      image={log.websiteUser.image}
                      showLabel={true}
                      tooltipSide="left"
                    />
                  ) : (
                    <span className="font-medium">{log.author}</span>
                  )}
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(log.timestamp), {
                    addSuffix: true,
                  })}
                </div>
                <span className="whitespace-nowrap text-muted-foreground">
                  •
                </span>
                <div className="min-w-0 truncate text-muted-foreground">
                  {renderMessageWithClickableLinks(log.content)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
