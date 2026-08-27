import { type db as database } from "~/server/db";
import { achievements, achievementTiers } from "~/server/db/schema";
import type { AchievementRuleConfig } from "~/server/db/schema";

type DB = typeof database;

export interface AchievementDefinition {
  name: string;
  description: string;
  icon: string;
  scope: "season" | "all_time";
  hidden: boolean;
  tiers: Partial<Record<"bronze" | "silver" | "gold" | "platinum", AchievementRuleConfig>>;
}

// Illustrative thresholds — a first-pass proposal, not final. Confirm/adjust once real
// lockout-week data exists to calibrate against (see spec-phase-2.md's own note on this).
// The 40-man zone list below (Molten Core, Blackwing Lair, Temple of Ahn'Qiraj, Naxxramas)
// assumes the guild's current progression and that `raids.zone`'s stored strings match these
// exactly — that match is unverified (raids.zone is free text, no enum) and should be confirmed
// against real data before this seeds for real.
const ATTENDANCE: AchievementDefinition = {
  name: "Raid Attendance",
  description: "Attend a high percentage of raids over a lockout-week window.",
  icon: "calendar-check",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "attendance_threshold", minPercent: 60, lockoutWeeks: 4 },
    silver: { shape: "attendance_threshold", minPercent: 75, lockoutWeeks: 6 },
    gold: { shape: "attendance_threshold", minPercent: 90, lockoutWeeks: 8 },
    platinum: { shape: "attendance_threshold", minPercent: 100, lockoutWeeks: 10 },
  },
};

const CONSISTENCY: AchievementDefinition = {
  name: "Consistency",
  description: "Sign up early and attend on the same character, without changing status.",
  icon: "check-circle",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "consistency_match", minCount: 3, lockoutWeeks: 6 },
    silver: { shape: "consistency_match", minCount: 6, lockoutWeeks: 8 },
    gold: { shape: "consistency_match", minCount: 10, lockoutWeeks: 10 },
    platinum: { shape: "consistency_match", minCount: 15, lockoutWeeks: 12 },
  },
};

const FLEXIBILITY: AchievementDefinition = {
  name: "Flexibility",
  description: "Sign up on one character but attend on another in the same family.",
  icon: "shuffle",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "flexibility_match", minCount: 2, lockoutWeeks: 6 },
    silver: { shape: "flexibility_match", minCount: 4, lockoutWeeks: 8 },
    gold: { shape: "flexibility_match", minCount: 7, lockoutWeeks: 10 },
    platinum: { shape: "flexibility_match", minCount: 10, lockoutWeeks: 12 },
  },
};

const BENCH_CREDIT: AchievementDefinition = {
  name: "Bench Credit",
  description: "Sign up and get benched — showing up counts even when you don't raid.",
  icon: "armchair",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "bench_credit_count", minCount: 3, lockoutWeeks: 6 },
    silver: { shape: "bench_credit_count", minCount: 6, lockoutWeeks: 8 },
    gold: { shape: "bench_credit_count", minCount: 10, lockoutWeeks: 10 },
    platinum: { shape: "bench_credit_count", minCount: 15, lockoutWeeks: 12 },
  },
};

const ZONE_ATTENDANCE_ZONES = [
  "Molten Core",
  "Blackwing Lair",
  "Temple of Ahn'Qiraj",
  "Naxxramas",
] as const;

function zoneAttendanceDefinition(zone: string): AchievementDefinition {
  return {
    name: `Zone Attendance — ${zone}`,
    description: `Attend ${zone} many times within a season window.`,
    icon: "map-pin",
    scope: "season",
    hidden: false,
    tiers: {
      bronze: { shape: "zone_attendance_threshold", zone, minCount: 3, lockoutWeeks: 4 },
      silver: { shape: "zone_attendance_threshold", zone, minCount: 6, lockoutWeeks: 6 },
      gold: { shape: "zone_attendance_threshold", zone, minCount: 10, lockoutWeeks: 8 },
      platinum: { shape: "zone_attendance_threshold", zone, minCount: 15, lockoutWeeks: 10 },
    },
  };
}

const RAID_MARATHON: AchievementDefinition = {
  name: "Raid Marathon",
  description: "Attend several distinct raids within a single lockout week.",
  icon: "zap",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "raid_marathon_density", minRaidsInOneWeek: 2, lockoutWeeks: 1 },
    silver: { shape: "raid_marathon_density", minRaidsInOneWeek: 3, lockoutWeeks: 1 },
    gold: { shape: "raid_marathon_density", minRaidsInOneWeek: 4, lockoutWeeks: 1 },
    platinum: { shape: "raid_marathon_density", minRaidsInOneWeek: 5, lockoutWeeks: 1 },
  },
};

const ZONE_BREADTH: AchievementDefinition = {
  name: "Zone Breadth",
  description: "Raid in several distinct zones within a season window.",
  icon: "compass",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "zone_breadth_window", minDistinctZones: 2, lockoutWeeks: 6 },
    silver: { shape: "zone_breadth_window", minDistinctZones: 3, lockoutWeeks: 8 },
    gold: { shape: "zone_breadth_window", minDistinctZones: 4, lockoutWeeks: 10 },
    platinum: { shape: "zone_breadth_window", minDistinctZones: 4, lockoutWeeks: 6 },
  },
};

const CLASS_BREADTH: AchievementDefinition = {
  name: "Class Breadth",
  description: "Raid as several distinct classes within a season window.",
  icon: "users",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "class_breadth_window", minDistinctClasses: 2, lockoutWeeks: 6 },
    silver: { shape: "class_breadth_window", minDistinctClasses: 3, lockoutWeeks: 8 },
    gold: { shape: "class_breadth_window", minDistinctClasses: 4, lockoutWeeks: 10 },
    platinum: { shape: "class_breadth_window", minDistinctClasses: 5, lockoutWeeks: 12 },
  },
};

const FAMILY_DOUBLE_UP: AchievementDefinition = {
  name: "Family Double-Up",
  description: "Two characters from the same family both attend the same raid.",
  icon: "users-2",
  scope: "season",
  hidden: false,
  tiers: {
    bronze: { shape: "family_double_up_cooccurrence", minCount: 1, lockoutWeeks: 6 },
    silver: { shape: "family_double_up_cooccurrence", minCount: 3, lockoutWeeks: 8 },
    gold: { shape: "family_double_up_cooccurrence", minCount: 6, lockoutWeeks: 10 },
    platinum: { shape: "family_double_up_cooccurrence", minCount: 10, lockoutWeeks: 12 },
  },
};

// All-time example: reuses Class Breadth's shape, unbounded window (no lockoutWeeks) — proves
// the season/all-time scope dimension is a config toggle, not new engineering. "All available
// Horde classes" is 9 (Warrior, Paladin isn't Horde in Classic — actual roster is Warrior,
// Hunter, Rogue, Priest, Shaman, Mage, Warlock, Druid = 8; kept as a single platinum-only
// capstone tier per the illustrative nature of this pass).
const CLASS_BREADTH_ALL_TIME: AchievementDefinition = {
  name: "Every Horde Class, Ever",
  description: "Raid as every available Horde class across all of history.",
  icon: "crown",
  scope: "all_time",
  hidden: false,
  tiers: {
    platinum: { shape: "class_breadth_window", minDistinctClasses: 8 },
  },
};

export function getAchievementDefinitions(): AchievementDefinition[] {
  return [
    ATTENDANCE,
    CONSISTENCY,
    FLEXIBILITY,
    BENCH_CREDIT,
    ...ZONE_ATTENDANCE_ZONES.map(zoneAttendanceDefinition),
    RAID_MARATHON,
    ZONE_BREADTH,
    CLASS_BREADTH,
    FAMILY_DOUBLE_UP,
    CLASS_BREADTH_ALL_TIME,
  ];
}

/** Seeds every rule-based achievement definition, each tier's config included. Distinct from
 *  Phase 1's `createAchievement` (manual-grant, no rule attached) — this is the code-level
 *  seeding path decisions[8] calls for. Idempotent per-run only via the caller checking first;
 *  this function itself always inserts fresh rows (intended as a one-time or re-seeded-from-
 *  scratch operation, not something called on every evaluation). */
export async function seedAchievementDefinitions(
  db: DB,
  seasonId: string,
  actingUserId?: string,
): Promise<{ achievementIds: string[] }> {
  const achievementIds: string[] = [];
  for (const definition of getAchievementDefinitions()) {
    const tierConfigs = Object.values(definition.tiers) as AchievementRuleConfig[];
    const ruleShape = tierConfigs[0]?.shape ?? null;

    const [achievement] = await db
      .insert(achievements)
      .values({
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        scope: definition.scope,
        seasonId: definition.scope === "season" ? seasonId : null,
        ruleShape,
        hidden: definition.hidden,
        createdById: actingUserId ?? null,
      })
      .returning();
    achievementIds.push(achievement!.id);

    for (const [tier, config] of Object.entries(definition.tiers) as Array<
      [keyof AchievementDefinition["tiers"], AchievementRuleConfig]
    >) {
      await db.insert(achievementTiers).values({
        achievementId: achievement!.id,
        tier: tier as "bronze" | "silver" | "gold" | "platinum",
        ruleConfig: config,
      });
    }
  }
  return { achievementIds };
}
