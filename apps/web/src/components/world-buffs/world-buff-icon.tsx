"use client";

import { useState } from "react";
import Image from "next/image";
import { SpellIcon } from "~/components/ui/aa-icons";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { cn } from "~/lib/utils";
import {
  WORLD_BUFF_BY_ITEM,
  WORLD_BUFF_ICON,
  WORLD_BUFF_ITEM_ICON_OVERRIDE,
  WORLD_BUFF_ITEM_LABELS,
  WORLD_BUFF_LABELS,
  WORLD_BUFF_SPELL_ID,
  type WorldBuff,
  type WorldBuffItem,
} from "~/lib/world-buffs";

/**
 * A buff's own icon (not a specific turn-in item's) — the local file committed to
 * `public/img/world-buffs/`, fetched once from Wowhead rather than on every page load. Only
 * falls back to the live Wowhead-fetched `SpellIcon` if that committed asset somehow fails to
 * load. Used by `WorldBuffIcon`'s fallback below, `DragonBuffIcon`'s dragon half, and the buff
 * picker in `AssignmentList`.
 */
export function BuffIcon({
  buff,
  size = 22,
  className,
}: {
  buff: WorldBuff;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (errored) {
    return <SpellIcon spellId={WORLD_BUFF_SPELL_ID[buff]} size={size} className={className} />;
  }

  return (
    <Image
      src={WORLD_BUFF_ICON[buff]}
      alt={WORLD_BUFF_LABELS[buff]}
      width={size}
      height={size}
      className={className ?? "inline-block rounded-sm align-text-bottom"}
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
    />
  );
}

/**
 * Icon for a turn-in item, with a tooltip naming the item and the buff it grants. Prefers a
 * per-item override image (see `WORLD_BUFF_ITEM_ICON_OVERRIDE`) so Onyxia's Head and Nefarian's
 * Head — which both grant the same Dragon buff — can look visually distinct; falls back to the
 * shared buff's Wowhead icon if no override file exists yet, or if it fails to load.
 */
export function WorldBuffIcon({
  item,
  size = 22,
  className,
  grayscale = false,
  showTooltip = true,
}: {
  item: WorldBuffItem;
  size?: number;
  className?: string;
  /** Dims a dropped row's icon to gray rather than full color, so a glance down the list reads
   *  which turn-ins are already done. Applied to the tooltip trigger wrapper — a CSS filter
   *  affects its whole subtree — rather than threading it through both icon branches below. */
  grayscale?: boolean;
  /** Set false when the icon sits somewhere that already has its own tooltip (e.g. a disabled
   *  menu item explaining itself) — avoids nesting one Radix Tooltip trigger inside another. */
  showTooltip?: boolean;
}) {
  const overrideSrc = WORLD_BUFF_ITEM_ICON_OVERRIDE[item];
  const [overrideErrored, setOverrideErrored] = useState(false);
  const buff = WORLD_BUFF_BY_ITEM[item];

  const icon =
    overrideSrc && !overrideErrored ? (
      <Image
        src={overrideSrc}
        alt={WORLD_BUFF_ITEM_LABELS[item]}
        width={size}
        height={size}
        className={className ?? "inline-block rounded-sm align-text-bottom"}
        style={{ width: size, height: size }}
        onError={() => setOverrideErrored(true)}
      />
    ) : (
      <BuffIcon buff={buff} size={size} className={className} />
    );

  const wrapped = (
    <span className={cn("inline-flex shrink-0", grayscale && "grayscale")}>{icon}</span>
  );

  if (!showTooltip) return wrapped;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{wrapped}</TooltipTrigger>
      <TooltipContent className="bg-secondary text-muted-foreground">
        {WORLD_BUFF_ITEM_LABELS[item]} — {WORLD_BUFF_LABELS[buff]}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Dragon is the one buff granted by two separate turn-ins (Onyxia's Head, Nefarian's Head), so
 * a single item/buff icon can't represent it the way `WorldBuffIcon` does for the other three.
 * Renders both item icons full-size, each clipped to its half of a top-left-to-bottom-right
 * diagonal — used wherever the two are shown combined (the Buff picker, the merged queue card).
 */
export function DragonBuffIcon({
  size = 22,
  grayscale = false,
}: {
  size?: number;
  grayscale?: boolean;
}) {
  return (
    <span
      className={cn("relative inline-block shrink-0", grayscale && "grayscale")}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: "polygon(0% 0%, 100% 0%, 100% 100%)" }}
      >
        <BuffIcon buff="dragon" size={size} />
      </span>
      <span
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: "polygon(0% 0%, 100% 100%, 0% 100%)" }}
      >
        <Image
          src={WORLD_BUFF_ITEM_ICON_OVERRIDE.onyxias_head!}
          alt="Onyxia's Head"
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className="rounded-sm"
        />
      </span>
    </span>
  );
}
