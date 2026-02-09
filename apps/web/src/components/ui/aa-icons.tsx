/**
 * AngryAssignments Icon Components
 *
 * Renders inline icons for AA templates: raid markers, roles, classes, abilities, spells.
 */

"use client";

import { useState } from "react";
import Image from "next/image";
import { HelpCircle } from "lucide-react";
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
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgErrored, setImgErrored] = useState(false);

  const baseClassName =
    className ?? "inline-block rounded-sm align-text-bottom";

  // Phase 1: hook is fetching icon name from Wowhead
  // Phase 2: icon name resolved but CDN image not yet loaded
  // Show HelpCircle as stable placeholder for both phases
  const showPlaceholder = loading || (!imgLoaded && !imgErrored);
  const showError = error || !icon || imgErrored;

  if (!loading && showError) {
    return (
      <HelpCircle
        className={`${baseClassName} text-muted-foreground`}
        style={{ width: size, height: size }}
        aria-label={`Unknown spell: ${spellId}`}
      />
    );
  }

  return (
    <span
      className={`${baseClassName} relative`}
      style={{ width: size, height: size, display: "inline-block" }}
    >
      {showPlaceholder && (
        <HelpCircle
          className="absolute inset-0 text-muted-foreground"
          style={{ width: size, height: size }}
        />
      )}
      {icon && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getSpellIconUrl(icon)}
          alt={`Spell ${spellId}`}
          width={size}
          height={size}
          className={imgLoaded ? "rounded-sm" : "opacity-0"}
          style={{ width: size, height: size }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgErrored(true)}
        />
      )}
    </span>
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
    <AAImageIcon src={iconPath} alt={name} size={size} className={className} />
  );
}

/**
 * Image icon with fixed dimensions to prevent layout shift.
 * Shows HelpCircle only on load error.
 */
function AAImageIcon({
  src,
  alt,
  size = 14,
  className,
}: {
  src: string;
  alt: string;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);

  const baseClassName = className ?? "inline-block align-text-bottom";

  if (errored) {
    return (
      <HelpCircle
        className={`${baseClassName} text-muted-foreground`}
        style={{ width: size, height: size }}
        aria-label={alt}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={size}
      height={size}
      className={baseClassName}
      style={{ width: size, height: size }}
      onError={() => setErrored(true)}
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
