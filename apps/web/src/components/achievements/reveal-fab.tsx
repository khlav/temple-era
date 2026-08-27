"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { api } from "~/trpc/react";
import { RevealOverlay } from "~/components/achievements/reveal-overlay";

/**
 * Global floating button, badged with the caller's own unseen-award count. Reveal only ever
 * fires on deliberate click — never automatically — per the contract's explicit decision.
 *
 * No dedicated global "FAB" pattern exists elsewhere in this codebase (confirmed during Phase 3
 * scouting — GlobalQuickLauncher is a Cmd/Ctrl+K modal, not a floating button); this component
 * establishes the pattern rather than following one. Plain local useState is sufficient since
 * there is exactly one consumer (itself) — no shared context needed.
 */
export function RevealFab(): React.JSX.Element | null {
  const { data: unseen } = api.achievement.getUnseenAwards.useQuery();
  const markSeen = api.achievement.markSeen.useMutation();
  const [open, setOpen] = React.useState(false);

  if (!unseen || unseen.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${unseen.length} new achievement${unseen.length === 1 ? "" : "s"} to view`}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/90 px-4 py-3 text-sm font-semibold text-amber-950 shadow-lg shadow-amber-900/30 transition hover:bg-amber-400"
      >
        <Sparkles className="size-5" />
        <span>{unseen.length}</span>
      </button>
      {open && (
        <RevealOverlay
          awards={unseen}
          onDismiss={() => {
            markSeen.mutate({ achievementAwardIds: unseen.map((a) => a.achievementAwardId) });
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
