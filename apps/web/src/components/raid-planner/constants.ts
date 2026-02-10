import { Armchair, CircleHelp, Clock } from "lucide-react";

/** Background colors with alpha, keyed by WoW class name */
export const CLASS_COLORS: Record<string, string> = {
  Druid: "rgba(255, 124, 10, 0.28)",
  Hunter: "rgba(107, 212, 85, 0.28)",
  Mage: "rgba(63, 199, 235, 0.28)",
  Paladin: "rgba(244, 140, 186, 0.28)",
  Priest: "rgba(255, 255, 255, 0.18)",
  Rogue: "rgba(255, 224, 60, 0.24)",
  Shaman: "rgba(0, 112, 221, 0.28)",
  Warlock: "rgba(135, 136, 238, 0.28)",
  Warrior: "rgba(198, 155, 109, 0.28)",
};

/** Tailwind text color classes for WoW classes (used in AA preview) */
export const CLASS_TEXT_COLORS: Record<string, string> = {
  Druid: "text-[#FF7C0A]",
  Hunter: "text-[#ABD473]",
  Mage: "text-[#69CCF0]",
  Paladin: "text-[#F58CBA]",
  Priest: "text-white",
  Rogue: "text-[#FFF569]",
  Shaman: "text-[#0070DE]",
  Warlock: "text-[#9482C9]",
  Warrior: "text-[#C79C6E]",
};

export const WOW_CLASSES = [
  "Druid",
  "Hunter",
  "Mage",
  "Paladin",
  "Priest",
  "Rogue",
  "Shaman",
  "Warlock",
  "Warrior",
] as const;

export const WOW_CLASSES_SET = new Set<string>(WOW_CLASSES);

/** RaidHelper signup statuses that get special icons (non-WoW classes) */
export const RAIDHELPER_STATUS_ICONS: Record<
  string,
  React.ComponentType<{ className?: string }>
> = {
  Bench: Armchair,
  Tentative: CircleHelp,
  Late: Clock,
};

/** All valid writeInClass values (WoW classes + RaidHelper statuses) */
export const VALID_WRITE_IN_CLASSES = new Set<string>([
  ...WOW_CLASSES,
  ...Object.keys(RAIDHELPER_STATUS_ICONS),
]);

export const WOW_SERVERS = [
  "Ashkandi",
  "Mankrik",
  "Pagle",
  "Westfall",
  "Windseeker",
] as const;

/** Instance IDs for 20-man raids */
export const TWENTY_MAN_INSTANCES = ["aq20", "zg", "onyxia"] as const;

/** Returns the number of groups for a given zone (4 for 20-man, 8 otherwise) */
export function getGroupCount(zoneId: string): number {
  return TWENTY_MAN_INSTANCES.includes(
    zoneId.toLowerCase() as (typeof TWENTY_MAN_INSTANCES)[number],
  )
    ? 4
    : 8;
}
