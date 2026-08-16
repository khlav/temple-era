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
  /** Active-state fill (border + bg + text) — a category's own color (e.g. a zone's
   *  accent) instead of the generic primary highlight. Only consulted in multi-select
   *  mode (`activeIds`/`onToggle`); single-select mode always uses the primary fill. */
  activeClassName?: string;
  icon?: ReactNode;
}

/**
 * Persistent filter rail for a category a user filters by (zone, profession) — counts
 * make it a summary as well as a control. Pattern spec: "Filter rail", used on /raids
 * and /rare-recipes. Does not scroll independently; it's short by construction.
 *
 * Two selection modes, chosen by which prop pair is passed:
 * - Single-select (`activeId`/`onSelect`): exactly one item highlighted, generic primary fill.
 * - Multi-select OR (`activeIds`/`onToggle`): any number of items toggled independently, each
 *   in its own `activeClassName` when active — the raids zone filter's "click a zone to add/
 *   remove it from the filter" behavior, matching the dashboard's zone-tile OR filtering.
 */
export function FilterRail({
  heading,
  items,
  activeId,
  onSelect,
  activeIds,
  onToggle,
}: {
  heading: string;
  items: FilterRailItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  activeIds?: Set<string>;
  onToggle?: (id: string) => void;
}) {
  const isMulti = !!activeIds;

  return (
    <aside className="flex w-full shrink-0 flex-row flex-wrap gap-2 lg:w-[208px] lg:flex-col lg:flex-nowrap lg:gap-1.5">
      <div className="w-full px-1 pb-1 font-display text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
        {heading}
      </div>
      {items.map((item) => {
        const isActive = isMulti ? activeIds.has(item.id) : item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => (isMulti ? onToggle?.(item.id) : onSelect?.(item.id))}
            aria-pressed={isMulti ? isActive : undefined}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] transition-colors",
              isActive
                ? (item.activeClassName ?? "border-primary/35 bg-primary/12 text-primary")
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
