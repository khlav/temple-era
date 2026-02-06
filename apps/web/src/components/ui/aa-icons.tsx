/**
 * AngryAssignments Icon Components
 *
 * Renders inline icons for AA templates: raid markers, roles, classes, abilities, spells.
 */

"use client";

import Image from "next/image";
import { HelpCircle, Loader2 } from "lucide-react";
import { ClassIcon } from "./class-icon";
import { useSpellIcon, getSpellIconUrl } from "~/hooks/use-spell-icon";
import type { AAIconType } from "~/lib/aa-formatting";

interface AAIconProps {
  name: string;
  type: AAIconType;
  size?: number;
  className?: string;
}

/**
 * Spell icon component that fetches icon data from Wowhead.
 */
function SpellIconInternal({
  spellId,
  size = 14,
  className,
}: {
  spellId: number;
  size?: number;
  className?: string;
}) {
  const { icon, loading, error } = useSpellIcon(spellId);

  const baseClassName =
    className ?? "inline-block rounded-sm align-text-bottom";

  if (loading) {
    return (
      <span
        className={`${baseClassName} flex items-center justify-center bg-muted`}
        style={{ width: size, height: size }}
      >
        <Loader2
          className="animate-spin text-muted-foreground"
          style={{ width: size * 0.7, height: size * 0.7 }}
        />
      </span>
    );
  }

  if (error || !icon) {
    return (
      <span
        className={`${baseClassName} flex items-center justify-center bg-muted`}
        style={{ width: size, height: size }}
        title={`Unknown spell: ${spellId}`}
      >
        <HelpCircle
          className="text-muted-foreground"
          style={{ width: size * 0.7, height: size * 0.7 }}
        />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={getSpellIconUrl(icon)}
      alt={`Spell ${spellId}`}
      width={size}
      height={size}
      className={baseClassName}
    />
  );
}

/**
 * Render an AA icon based on type and name.
 */
export function AAIcon({ name, type, size = 14, className }: AAIconProps) {
  // Class icons use the existing ClassIcon component
  if (type === "class") {
    // Normalize deathknight -> death knight for ClassIcon
    const classForIcon = name === "deathknight" ? "death knight" : name;
    return (
      <ClassIcon
        characterClass={classForIcon}
        px={size}
        className={className ?? "inline-block align-text-bottom"}
      />
    );
  }

  // Spell icons fetch from Wowhead
  if (type === "spell") {
    const spellId = parseInt(name, 10);
    return (
      <SpellIconInternal spellId={spellId} size={size} className={className} />
    );
  }

  // Other icons use SVGs from /public/img/aa/
  let iconPath: string;
  switch (type) {
    case "marker":
      iconPath = `/img/aa/marker_${name}.svg`;
      break;
    case "role":
      iconPath = `/img/aa/role_${name}.svg`;
      break;
    case "ability":
      iconPath = `/img/aa/ability_${name}.svg`;
      break;
    default:
      return null;
  }

  return (
    <Image
      src={iconPath}
      alt={name}
      width={size}
      height={size}
      className={className ?? "inline-block align-text-bottom"}
    />
  );
}

/**
 * Raid marker icon component.
 */
export function RaidMarkerIcon({
  marker,
  size = 14,
  className,
}: {
  marker: string;
  size?: number;
  className?: string;
}) {
  return (
    <AAIcon name={marker} type="marker" size={size} className={className} />
  );
}

/**
 * Role icon component (tank, healer, dps).
 */
export function RoleIcon({
  role,
  size = 14,
  className,
}: {
  role: "tank" | "healer" | "dps";
  size?: number;
  className?: string;
}) {
  return <AAIcon name={role} type="role" size={size} className={className} />;
}

/**
 * Ability icon component (bloodlust, healthstone).
 */
export function AbilityIcon({
  ability,
  size = 14,
  className,
}: {
  ability: string;
  size?: number;
  className?: string;
}) {
  return (
    <AAIcon name={ability} type="ability" size={size} className={className} />
  );
}

/**
 * Spell icon component (by spell ID).
 */
export function SpellIcon({
  spellId,
  size = 14,
  className,
}: {
  spellId: number;
  size?: number;
  className?: string;
}) {
  return (
    <SpellIconInternal spellId={spellId} size={size} className={className} />
  );
}
