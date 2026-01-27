"use client";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { INSTANCE_TO_ZONE } from "~/lib/raid-zones";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { ZoneIndicator } from "./zone-indicator";

export function DiscordSoftResLinks() {
  const router = useRouter();

  const {
    data: softResLinks,
    isLoading,
    isError,
    error,
  } = api.softres.getSoftResLinksFromDiscord.useQuery();

  if (isLoading) {
    return (
      <div className="mt-8">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-muted-foreground">
            Loading Discord SoftRes links...
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mt-8">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-destructive">
            Failed to load Discord SoftRes links: {error?.message}
          </div>
        </div>
      </div>
    );
  }

  if (!softResLinks || softResLinks.length === 0) {
    return (
      <div className="mt-8">
        <div className="flex items-center justify-center py-8">
          <div className="text-sm text-muted-foreground">
            No SoftRes links found in Discord
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 w-full">
      <div className="mb-4">
        <h3 className="text-lg font-semibold">
          Found {softResLinks.length} RaidHelper post
          {softResLinks.length !== 1 ? "s" : ""} with SoftRes links{" "}
          <span className="text-xs font-normal italic text-muted-foreground">
            Last 7 days
          </span>
        </h3>
      </div>

      <div className="space-y-2">
        {softResLinks.map((link) => {
          // Prefer embed title (e.g., "Saturday AQ40 @9PM") over generated title
          let raidTitle = link.embedTitle;

          // Fallback to instance + date if no embed title
          if (!raidTitle) {
            const zoneName = link.raidInstance
              ? (INSTANCE_TO_ZONE[link.raidInstance] ?? link.raidInstance)
              : null;

            const raidDateFormatted = link.raidDate
              ? formatEasternDateTime(new Date(link.raidDate), "MMM d, yyyy")
              : null;

            raidTitle =
              zoneName && raidDateFormatted
                ? `${zoneName} - ${raidDateFormatted}`
                : zoneName || raidDateFormatted || "SoftRes";
          }

          // Format message posted time
          const postedTime = formatDistanceToNow(new Date(link.timestamp), {
            addSuffix: true,
          });

          // Format raid date/time for display in Eastern Time (without timezone abbreviation)
          const raidDateTime = link.raidDateTime
            ? new Date(link.raidDateTime)
            : null;
          const raidDateDisplay = raidDateTime
            ? formatEasternDateTime(raidDateTime, "EEE, MMM d 'at' h:mm a")
            : null;

          return (
            <div
              key={`${link.messageId}-${link.softResRaidId}`}
              className="flex items-center gap-2 py-1 text-sm"
            >
              {/* Scan Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  router.push(`/softres/${link.softResRaidId}`);
                }}
                className="w-20"
              >
                Scan
              </Button>

              {/* Zone Indicator + Raid Name */}
              <div className="flex items-center gap-2">
                <ZoneIndicator
                  raidTitle={raidTitle}
                  instance={link.raidInstance}
                />
                <span className="font-medium">{raidTitle}</span>
              </div>

              {/* Raid date/time (no EST label) */}
              {raidDateDisplay && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {raidDateDisplay}
                </span>
              )}

              {/* Posted time with clock icon and channel link */}
              <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{postedTime}</span>
                <span>in</span>
                <a
                  href={`https://discord.com/channels/${link.guildId}/${link.channelId}/${link.messageId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  #{link.channelName}
                </a>
              </div>

              {/* SoftRes link */}
              <a
                href={link.softResUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-muted-foreground hover:text-foreground"
                title={link.softResUrl}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
