"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { api } from "~/trpc/react";
import { MedalIcon, TIER_CONFIG, TIER_LABEL } from "~/components/achievements/reveal-overlay";
import type { AchievementTierLevel } from "~/components/achievements/reveal-overlay";
import { CharacterLink } from "~/components/ui/character-link";
import { getSpellIconUrl } from "~/hooks/use-spell-icon";
import { cn } from "~/lib/utils";
import type {
  AchievementGroup,
  PopularityItem,
  PopularityUncracked,
} from "~/server/services/achievement-queries";

const TIERS: AchievementTierLevel[] = ["copper", "silver", "gold", "thorium", "arcanite"];

function TierLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {TIERS.map((tier) => (
        <div
          key={tier}
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground"
        >
          <span
            className="size-2.5 shrink-0 rounded-sm"
            style={{ background: TIER_CONFIG[tier].tier }}
          />
          {TIER_LABEL[tier]}
        </div>
      ))}
    </div>
  );
}

function medalVars(tier: AchievementTierLevel) {
  const t = TIER_CONFIG[tier];
  return { ["--ro-tier" as string]: t.tier, ["--ro-hi" as string]: t.hi };
}

function PopularityRow({
  item,
  roster,
  open,
  onToggle,
}: {
  item: PopularityItem;
  roster: number;
  open: boolean;
  onToggle: () => void;
}) {
  const pct = (n: number) => (roster > 0 ? (n / roster) * 100 : 0);
  const totalLeft = Math.min(100, pct(item.total));

  // Tier chips under the name, rarest first — same order the reveal overlay's own strip uses.
  const tierCounts = TIERS.map((tier, i) => ({ tier, count: item.counts[i] ?? 0 }))
    .filter((g) => g.count > 0)
    .reverse();

  return (
    <div
      className={cn("rounded-lg border", open ? "border-border bg-muted/40" : "border-transparent")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[34px_minmax(0,208px)_minmax(160px,1fr)] items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-accent/40"
      >
        <div className="ro-icon-xs relative shrink-0" style={medalVars(item.topTier)}>
          <MedalIcon tier={item.topTier} icon={item.icon} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight">{item.name}</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide">
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
        <div className="max-w-[430px] pr-12">
          <div className="relative h-4">
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
                      {cfg.label} {step.value}
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
    <div className="grid grid-cols-[34px_minmax(0,208px)_minmax(160px,1fr)] items-center gap-2 rounded-lg p-1.5 opacity-50">
      {/* eslint-disable-next-line @next/next/no-img-element -- external CDN, not a local asset */}
      <img
        src={getSpellIconUrl(item.icon, "small")}
        alt=""
        width={34}
        height={34}
        className="block rounded-md border border-border grayscale"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight">{item.name}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Uncracked</div>
      </div>
      <div className="max-w-[430px] pr-12">
        <div className="h-4 rounded-sm bg-muted shadow-[inset_0_0_0_1px_hsl(var(--border))]" />
      </div>
    </div>
  );
}

function GroupSection({
  label,
  items,
  uncracked,
  roster,
  open,
  onToggle,
}: {
  label: AchievementGroup;
  items: PopularityItem[];
  uncracked: PopularityUncracked[];
  roster: number;
  open: Record<string, boolean>;
  onToggle: (achievementId: string) => void;
}) {
  if (items.length === 0 && uncracked.length === 0) return null;
  return (
    <div className="flex flex-row gap-3">
      <div className="flex w-6 flex-none items-center justify-center border-r border-border">
        <span className="whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground [writing-mode:vertical-rl] rotate-180">
          {label}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {items.map((item) => (
          <PopularityRow
            key={item.achievementId}
            item={item}
            roster={roster}
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
  const toggle = (achievementId: string) =>
    setOpen((s) => ({ ...s, [achievementId]: !s[achievementId] }));

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-3">
        <p className="max-w-[62ch] text-[13px] leading-relaxed text-muted-foreground">
          How rare each achievement is: the filled track is the share of the{" "}
          <span className="text-foreground">{data.roster} S2 players</span> who hold it, split by
          the tier they&apos;re standing on. Click a row for who has it.
        </p>
        <TierLegend />
      </div>
      <div className="flex flex-col gap-3">
        {data.groups.map((group) => (
          <GroupSection
            key={group}
            label={group}
            items={data.items.filter((i) => i.group === group)}
            uncracked={data.uncracked.filter((u) => u.group === group)}
            roster={data.roster}
            open={open}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
