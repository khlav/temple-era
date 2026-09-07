"use client";

import { Pencil } from "lucide-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { formatEasternDateTime } from "~/lib/raid-formatting";
import { RaidSignupLinkControl } from "~/components/raids/raid-signup-link-control";
import { WCLIcon } from "~/components/ui/wcl-icon";
import { DiscordIcon } from "~/components/ui/discord-icon";

const CARD_DATETIME_FORMAT = "EEE, MMM d 'at' h:mm a";

const ROW_LABEL_CLASSNAME =
  "text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80";

type SignupVsRaidLogData = NonNullable<RouterOutputs["raidSignupLink"]["signupVsRaidLog"]>;

function SignupBlock({
  signup,
  raidId,
  canEdit,
}: {
  signup: SignupVsRaidLogData["signup"];
  raidId: number;
  canEdit?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2">
        <div className={ROW_LABEL_CLASSNAME}>Signup</div>
        {canEdit ? (
          <RaidSignupLinkControl
            raidId={raidId}
            trigger={
              <button
                type="button"
                className="text-muted-foreground transition-colors hover:text-primary"
                title="Edit signup link"
              >
                <Pencil className="h-3 w-3" />
              </button>
            }
          />
        ) : null}
      </div>
      {signup ? (
        <div className="text-[13px]">
          <span className="font-medium">{signup.title ?? "Untitled event"}</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {formatEasternDateTime(signup.startTime, CARD_DATETIME_FORMAT)}
            {signup.eventUrl ? (
              <a
                href={signup.eventUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-[#5865F2] hover:text-[#5865F2]/80"
                title="Open in Discord"
              >
                <DiscordIcon className="size-3" />
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-muted-foreground">No signup linked</div>
      )}
    </div>
  );
}

function RaidLogBlock({ raidLog }: { raidLog: SignupVsRaidLogData["raidLog"] }) {
  return (
    <div className="min-w-0 flex-1">
      <div className={ROW_LABEL_CLASSNAME}>Raid log</div>
      {raidLog ? (
        <div className="text-[13px]">
          <span className="font-medium">{raidLog.name}</span>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {formatEasternDateTime(raidLog.startTimeUTC, CARD_DATETIME_FORMAT)}
            {raidLog.endTimeUTC ? ` – ${formatEasternDateTime(raidLog.endTimeUTC, "h:mm a")}` : ""}
            <a
              href={raidLog.wclUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center"
              title="Open in Warcraft Logs"
            >
              <WCLIcon size={13} />
            </a>
          </div>
        </div>
      ) : (
        <div className="text-[13px] text-muted-foreground">No log imported yet</div>
      )}
    </div>
  );
}

/**
 * Raid log timing next to the linked signup's title and start — the fastest way for a
 * raid manager to eyeball whether a raid is linked to the right Raid Helper signup.
 * Exists because the auto-matcher weighs timing far more than roster overlap (see
 * raid-signup-link-matching.ts) and can confidently link the wrong occurrence; the two
 * timestamps disagreeing is the signal a human can catch here that the algorithm can't.
 * Shared verbatim by the Signup Timeline and Signups <-> Attendees tabs — one component,
 * one query, both places.
 */
export function SignupVsRaidLogCard({
  raidId,
  canEdit,
  layout = "stacked",
}: {
  raidId: number;
  /** Shows an inline edit affordance next to the Signup row — same RAIDPLAN_MANAGE gate
   * as the header's RaidSignupLinkControl, since it opens that identical dialog. */
  canEdit?: boolean;
  /** "stacked" (default): Signup above Raid log, for the Signup Timeline tab's narrow
   * right column. "side-by-side": the two sit in a wider two-column header (Signups <->
   * Attendees tab) — same content, laid out horizontally with a divider. */
  layout?: "stacked" | "side-by-side";
}) {
  const { data, isLoading } = api.raidSignupLink.signupVsRaidLog.useQuery({ raidId });

  if (isLoading) {
    return (
      <div className="panel-surface rounded-2xl border border-border/70 px-[18px] py-4">
        <div className="h-12 animate-pulse rounded bg-secondary/60" />
      </div>
    );
  }

  if (!data || (!data.raidLog && !data.signup)) return null;

  return (
    <div className="panel-surface rounded-2xl border border-border/70 px-[18px] py-4">
      {layout === "side-by-side" ? (
        <div className="flex items-start gap-3">
          <SignupBlock signup={data.signup} raidId={raidId} canEdit={canEdit} />
          <div className="w-px self-stretch bg-border" />
          <RaidLogBlock raidLog={data.raidLog} />
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <SignupBlock signup={data.signup} raidId={raidId} canEdit={canEdit} />
          <RaidLogBlock raidLog={data.raidLog} />
        </div>
      )}
    </div>
  );
}
