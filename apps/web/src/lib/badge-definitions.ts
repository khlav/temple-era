import type { LucideIcon } from "lucide-react";
import {
  UserPlus,
  Armchair,
  Shuffle,
  Compass,
  Users,
  Scale,
  Flame,
  Sword,
  Bug,
  Skull,
  Shield,
  Target,
  Award,
  Trophy,
} from "lucide-react";

/**
 * Badge rarity levels matching WoW item quality
 */
export type BadgeRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/**
 * Badge category definition
 */
export interface BadgeCategory {
  rarity: BadgeRarity;
  label: string;
  colorClasses: string;
}

/**
 * Individual badge definition
 */
export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  rarity: BadgeRarity;
  icon: LucideIcon;
  order: number;
}

/**
 * WoW item rarity color scheme for badges
 */
export const BADGE_CATEGORIES: Record<BadgeRarity, BadgeCategory> = {
  common: {
    rarity: "common",
    label: "Common",
    colorClasses:
      "bg-gray-500/10 text-gray-700 dark:text-gray-300 border-gray-500/20",
  },
  uncommon: {
    rarity: "uncommon",
    label: "Uncommon",
    colorClasses:
      "bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20",
  },
  rare: {
    rarity: "rare",
    label: "Rare",
    colorClasses:
      "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  },
  epic: {
    rarity: "epic",
    label: "Epic",
    colorClasses:
      "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
  },
  legendary: {
    rarity: "legendary",
    label: "Legendary",
    colorClasses:
      "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/20",
  },
};

/**
 * All badge definitions ordered by difficulty (common -> legendary)
 */
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // Common (Gray/White) - 3 badges
  {
    id: "fresh-face",
    name: "Fresh Face",
    description: "New to raiding! Only attended raids in the last 1-2 weeks.",
    rarity: "common",
    icon: UserPlus,
    order: 1,
  },
  {
    id: "bench-warmer",
    name: "Bench Warmer",
    description:
      "Earned full week attendance credit through bench support in at least one week.",
    rarity: "common",
    icon: Armchair,
    order: 2,
  },
  {
    id: "shapeshifter",
    name: "Shapeshifter",
    description:
      "Flexed between multiple characters during raids in the same week.",
    rarity: "common",
    icon: Shuffle,
    order: 3,
  },

  // Uncommon (Green) - 3 badges
  {
    id: "dungeon-crawler",
    name: "Dungeon Crawler",
    description:
      "Explored all 4 main raid zones in the last 6 weeks (Naxx, AQ40, BWL, MC).",
    rarity: "uncommon",
    icon: Compass,
    order: 4,
  },
  {
    id: "tight-squad",
    name: "Tight Squad",
    description:
      "Joined 3+ different 20-man raids in the last 6 weeks (Onyxia, AQ20, ZG).",
    rarity: "uncommon",
    icon: Users,
    order: 5,
  },
  {
    id: "big-and-small",
    name: "Big and Small",
    description:
      "Participated in both 40-man and 20-man raids during the same week.",
    rarity: "uncommon",
    icon: Scale,
    order: 6,
  },

  // Rare (Blue) - 4 badges
  {
    id: "fire-walker",
    name: "Fire Walker",
    description: "Braved the flames of Molten Core for 4+ consecutive weeks.",
    rarity: "rare",
    icon: Flame,
    order: 7,
  },
  {
    id: "dragon-slayer",
    name: "Dragon Slayer",
    description: "Slayed dragons in Blackwing Lair for 4+ consecutive weeks.",
    rarity: "rare",
    icon: Sword,
    order: 8,
  },
  {
    id: "bug-whisperer",
    name: "Bug Whisperer",
    description: "Mastered the Temple of Ahn'Qiraj for 4+ consecutive weeks.",
    rarity: "rare",
    icon: Bug,
    order: 9,
  },
  {
    id: "necromancer",
    name: "Necromancer",
    description: "Conquered the terrors of Naxxramas for 4+ consecutive weeks.",
    rarity: "rare",
    icon: Skull,
    order: 10,
  },

  // Epic (Purple) - 3 badges
  {
    id: "iron-will",
    name: "Iron Will",
    description:
      "Showed unwavering commitment by attending at least 1 zone every week for 6 consecutive weeks.",
    rarity: "epic",
    icon: Shield,
    order: 11,
  },
  {
    id: "dedicated",
    name: "Dedicated",
    description:
      "Demonstrated dedication by attending 2+ 40-man raids in 4+ consecutive weeks.",
    rarity: "epic",
    icon: Target,
    order: 12,
  },
  {
    id: "completionist",
    name: "Completionist",
    description:
      "Completed all 7 raid instances in a single week (Naxx, AQ40, BWL, MC, Onyxia, AQ20, ZG).",
    rarity: "epic",
    icon: Award,
    order: 13,
  },

  // Legendary (Orange) - 1 badge
  {
    id: "perfect-attendance",
    name: "Perfect Attendance",
    description:
      "Achieved perfect attendance with 18/18 credits over the last 6 weeks.",
    rarity: "legendary",
    icon: Trophy,
    order: 14,
  },
];

/**
 * Get badge definition by ID
 */
export function getBadgeById(id: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find((badge) => badge.id === id);
}

/**
 * Get all badges for a specific rarity
 */
export function getBadgesByRarity(rarity: BadgeRarity): BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter((badge) => badge.rarity === rarity);
}
