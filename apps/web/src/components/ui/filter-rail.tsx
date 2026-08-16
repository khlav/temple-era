"use client";

import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

export interface FilterRailItem {
  id: string;
  label: string;
  count: number;
  /** Text color class for the label while inactive — a category's own accent (zone
   *  hue) when it has one, otherwise omit for plain foreground. Ignored when active:
   *  the active row is always primary, per the pattern spec. */
  accentClassName?: string;
  icon?: ReactNode;
}

/**
 * Persistent filter rail for a category a user filters by (zone, profession) — counts
 * make it a summary as well as a control. Pattern spec: "Filter rail", used on /raids
 * and /rare-recipes. Does not scroll independently; it's short by construction.
 */
export function FilterRail({
  heading,
  items,
  activeId,
  onSelect,
}: {
  heading: string;
  items: FilterRailItem[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex w-full shrink-0 flex-row flex-wrap gap-2 lg:w-[208px] lg:flex-col lg:flex-nowrap lg:gap-1.5">
      <div className="w-full px-1 pb-1 font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
        {heading}
      </div>
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors",
              isActive
                ? "border-primary/35 bg-primary/12 text-primary"
                : cn(
                    "border-border/70 bg-card/60 hover:bg-accent/40",
                    item.accentClassName ?? "text-foreground/90",
                  ),
            )}
          >
            {item.icon ? <span className="shrink-0 opacity-85">{item.icon}</span> : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="font-display shrink-0 text-[11px] text-muted-foreground/70">
              {item.count}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
