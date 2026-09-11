"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { api } from "~/trpc/react";
import { MedalIcon, TIER_CONFIG, TIER_LABEL } from "~/components/achievements/reveal-overlay";
import type { AchievementTierLevel } from "~/components/achievements/reveal-overlay";
import { CharacterLink } from "~/components/ui/character-link";
import { Switch } from "~/components/ui/switch";
import { getSpellIconUrl } from "~/hooks/use-spell-icon";
import { cn } from "~/lib/utils";
import type {
  AchievementGroup,
  PopularityItem,
  PopularityUncracked,
} from "~/server/services/achievement-queries";

const TIERS: AchievementTierLevel[] = ["copper", "silver", "gold", "thorium", "arcanite"];

function medalVars(tier: AchievementTierLevel) {
  const t = TIER_CONFIG[tier];
  return { ["--ro-tier" as string]: t.tier, ["--ro-hi" as string]: t.hi };
}

function PopularityRow({
  item,
  denominator,
  open,
  onToggle,
}: {
  item: PopularityItem;
  denominator: number;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = (n: number) => (denominator > 0 ? (n / denominator) * 100 : 0);
  const totalLeft = Math.min(100, pct(item.total));

  // Tier chips under the name, lowest to highest.
  const tierCounts = TIERS.map((tier, i) => ({ tier, count: item.counts[i] ?? 0 })).filter(
    (g) => g.count > 0,
  );

  return (
    <div
      className={cn(
        "max-w-[1000px] rounded-lg border",
        open ? "border-border bg-muted/40" : "border-transparent",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full cursor-pointer grid-cols-[44px_minmax(0,220px)_minmax(160px,1fr)] items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-accent/40"
      >
        <div className="ro-icon-sm relative shrink-0" style={medalVars(item.topTier)}>
          <MedalIcon tier={item.topTier} icon={item.icon} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{item.name}</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0 text-[10px] uppercase leading-tight tracking-wide">
            {tierCounts.map((g) => (
              <span
                key={g.tier}
                className="tabular-nums"
                style={{ color: TIER_CONFIG[g.tier].labelColor }}
              >
                {g.count} {TIER_LABEL[g.tier]}
              </span>
            ))}
          </div>
        </div>
        <div className="pr-12">
          <div className="relative h-6">
            <div className="absolute inset-0 flex overflow-hidden rounded-sm bg-muted shadow-[inset_0_0_0_1px_hsl(var(--border))]">
              {TIERS.map((tier, i) => {
                const width = pct(item.counts[i] ?? 0);
                if (width <= 0) return null;
                return (
                  <div
                    key={tier}
                    style={{ width: `${width}%`, background: TIER_CONFIG[tier].tier }}
                    className="shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]"
                  />
                );
              })}
            </div>
            <span
              className="absolute top-1/2 -translate-y-1/2 pl-2 text-[12.5px] font-semibold tabular-nums"
              style={{ left: `${totalLeft}%` }}
            >
              {item.total}
            </span>
          </div>
        </div>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3 pt-3">
          <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
            <span className="text-[12.5px] text-muted-foreground">
              {item.description || "No public description — awarded from the crafting catalog."}
            </span>
            {item.ladder && (
              <div className="flex flex-wrap items-baseline gap-1.5">
                {item.ladder.steps.map((step) => {
                  const cfg = TIER_CONFIG[step.tier];
                  const on = (item.counts[TIERS.indexOf(step.tier)] ?? 0) > 0;
                  return (
                    <span
                      key={step.tier}
                      className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
                      style={{
                        borderColor: on ? cfg.tier : "hsl(var(--border))",
                        color: on ? cfg.labelColor : "hsl(var(--muted-foreground) / 0.55)",
                      }}
                    >
                      {cfg.label} {on ? step.value : "??"}
                    </span>
                  );
                })}
                <span className="text-[11px] text-muted-foreground/80">{item.ladder.unit}</span>
              </div>
            )}
          </div>
          {TIERS.map((tier, i) => {
            const count = item.counts[i] ?? 0;
            if (count === 0) return null;
            const cfg = TIER_CONFIG[tier];
            const people = item.earners.filter((e) => e.tier === tier);
            return (
              <div key={tier} className="grid grid-cols-[88px_1fr] items-start gap-3">
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="size-2 shrink-0 rounded-sm" style={{ background: cfg.tier }} />
                  <span
                    className="text-[10.5px] font-semibold uppercase tracking-wide"
                    style={{ color: cfg.labelColor }}
                  >
                    {cfg.label}
                  </span>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground">{count}</span>
                </div>
                <div className="flex flex-wrap gap-x-3.5 gap-y-1">
                  {people.map((p) => (
                    <div key={p.characterId} className="w-fit">
                      <CharacterLink
                        characterId={p.characterId}
                        characterName={p.name}
                        characterClass={p.class}
                        iconSize={16}
                        className="text-[12.5px]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UncrackedRow({ item }: { item: PopularityUncracked }) {
  return (
    <div className="grid max-w-[1000px] grid-cols-[44px_minmax(0,220px)_minmax(160px,1fr)] items-center gap-2 rounded-lg p-1.5 opacity-50">
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, not a local asset */}
      <img
        src={getSpellIconUrl(item.icon, "small")}
        alt=""
        width={44}
        height={44}
        className="block rounded-md border border-border grayscale"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight">{item.name}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Uncracked</div>
      </div>
      <div className="pr-12">
        <div className="h-6 rounded-sm bg-muted shadow-[inset_0_0_0_1px_hsl(var(--border))]" />
      </div>
    </div>
  );
}

function GroupSection({
  label,
  items,
  uncracked,
  denominator,
  open,
  onToggle,
}: {
  label: AchievementGroup;
  items: PopularityItem[];
  uncracked: PopularityUncracked[];
  denominator: number;
  open: Record<string, boolean>;
  onToggle: (achievementId: string) => void;
}) {
  if (items.length === 0 && uncracked.length === 0) return null;
  return (
    <div className="flex flex-row gap-3">
      <div className="flex w-6 flex-none items-center justify-center border-r border-border">
        <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl] rotate-180 2xl:text-sm">
          {label}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {items.map((item) => (
          <PopularityRow
            key={item.achievementId}
            item={item}
            denominator={denominator}
            open={!!open[item.achievementId]}
            onToggle={() => onToggle(item.achievementId)}
          />
        ))}
        {uncracked.map((item) => (
          <UncrackedRow key={item.achievementId} item={item} />
        ))}
      </div>
    </div>
  );
}

export function AchievementPopularity(): React.JSX.Element {
  const { data, isLoading } = api.achievement.getAchievementPopularity.useQuery();
  const [open, setOpen] = React.useState<Record<string, boolean>>({});
  const [basis, setBasis] = React.useState<"roster" | "max">("roster");
  const [sortDirection, setSortDirection] = React.useState<"desc" | "asc">("desc");
  const [listMode, setListMode] = React.useState<"grouped" | "combined">("grouped");
  const toggle = (achievementId: string) =>
    setOpen((s) => ({ ...s, [achievementId]: !s[achievementId] }));

  // Must run on every render — including the isLoading/error early returns below — so the hook
  // count stays stable across the loading-to-loaded transition (Rules of Hooks).
  // Re-sort only for the ascending case — the query already hands back descending — with a name
  // tiebreak so equal-total items land in a stable order either way the toggle is flipped.
  const sortedItems = React.useMemo(() => {
    const items = [...(data?.items ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    items.sort((a, b) => (sortDirection === "desc" ? b.total - a.total : a.total - b.total));
    return items;
  }, [data?.items, sortDirection]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Reached only on a rejected query — `isLoading` is false but `data` never arrived. Without
  // this split, that state fell through to the spinner branch above and spun forever.
  if (!data) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Could not load achievement popularity. Please try again.
      </div>
    );
  }

  const denominator = basis === "roster" ? data.roster : data.max;
  // data.items is already sorted by total descending (see getAchievementPopularity), so the
  // first entry is the most-earned achievement — the one the "% of most-earned" basis names.
  // That's independent of the sort-direction toggle below, which only reorders what's rendered.
  const topItem = data.items[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-3">
        <p className="flex-1 text-[13px] leading-relaxed text-muted-foreground">
          {basis === "roster" ? (
            <>
              Achievements earned by all <span className="text-foreground">{data.roster}</span>{" "}
              players active in season 2 (incl. All Time award winners).
            </>
          ) : (
            <>
              Achievements scaled against the most-earned one,{" "}
              <span className="text-foreground">{topItem?.name}</span> (
              <span className="text-foreground">{data.max}</span> families).
            </>
          )}
        </p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={basis === "roster" ? "font-semibold text-foreground" : ""}>
              % of roster
            </span>
            <Switch
              checked={basis === "max"}
              onCheckedChange={(checked) => setBasis(checked ? "max" : "roster")}
              aria-label="Toggle bar scale between share of roster and share of the most-earned achievement"
            />
            <span className={basis === "max" ? "font-semibold text-foreground" : ""}>
              % of most-earned
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={sortDirection === "desc" ? "font-semibold text-foreground" : ""}>
              Most earned first
            </span>
            <Switch
              checked={sortDirection === "asc"}
              onCheckedChange={(checked) => setSortDirection(checked ? "asc" : "desc")}
              aria-label="Toggle sort direction between most-earned first and least-earned first"
            />
            <span className={sortDirection === "asc" ? "font-semibold text-foreground" : ""}>
              Least earned first
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={listMode === "grouped" ? "font-semibold text-foreground" : ""}>
              Grouped
            </span>
            <Switch
              checked={listMode === "combined"}
              onCheckedChange={(checked) => setListMode(checked ? "combined" : "grouped")}
              aria-label="Toggle listing between grouped by category and a single combined list"
            />
            <span className={listMode === "combined" ? "font-semibold text-foreground" : ""}>
              Combined
            </span>
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-[1050px] flex-col gap-8">
        {listMode === "grouped" ? (
          data.groups.map((group) => (
            <GroupSection
              key={group}
              label={group}
              items={sortedItems.filter((i) => i.group === group)}
              uncracked={data.uncracked.filter((u) => u.group === group)}
              denominator={denominator}
              open={open}
              onToggle={toggle}
            />
          ))
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {sortedItems.map((item) => (
              <PopularityRow
                key={item.achievementId}
                item={item}
                denominator={denominator}
                open={!!open[item.achievementId]}
                onToggle={() => toggle(item.achievementId)}
              />
            ))}
            {data.uncracked.map((item) => (
              <UncrackedRow key={item.achievementId} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
