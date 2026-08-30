import { inArray } from "drizzle-orm";
import { type db as database } from "~/server/db";
import { achievements, achievementTiers } from "~/server/db/schema";
import type { AchievementRuleConfig } from "~/server/db/schema";

type DB = typeof database;

/** Season 2's dates are fixed, not something officers ever need to create or edit — there's
 *  exactly one season and it doesn't move, so there's no admin "create season" flow anymore (it
 *  used to be a form on the Manage Achievements page). This constant is the single source of
 *  truth for what that one `season` row should contain; the row itself still exists in the DB
 *  (achievements.seasonId is a real FK, and resolveEvaluationWindow reads season.startDate from
 *  it) but is seeded/corrected to match this constant rather than user-entered.
 *
 *  Tue Sept 1, 2026 (a lockout reset) through Mon Jan 4, 2027 — the day before the next Tuesday
 *  reset, so the window ends cleanly at a lockout boundary rather than mid-week. */
export const SEASON_2 = {
  name: "Season 2",
  startDate: new Date("2026-09-01T00:00:00-04:00"),
  endDate: new Date("2027-01-04T23:59:59-05:00"),
};

export interface AchievementDefinition {
  name: string;
  description: string;
  /** Imperative/present-tense sibling of `description`, used only for the "For {tier}:" next-tier
   *  preview — see achievement-schema.ts's goalDescription column comment. Optional: an achievement
   *  with no goal phrasing just falls back to `description` there (acceptable, not ideal, for a
   *  hidden achievement that can never show a next-tier preview anyway). */
  goalDescription?: string;
  icon: string;
  scope: "season" | "all_time";
  hidden: boolean;
  tiers: Partial<
    Record<"copper" | "silver" | "gold" | "thorium" | "arcanite", AchievementRuleConfig>
  >;
}

// The finalized Season 2 catalog — every name, description template, icon, and threshold below
// was worked out collaboratively in the Achievement Ledger (an interactive planning artifact,
// not checked into this repo) and is transcribed here verbatim, not a fresh illustrative pass.
//
// `description` strings intentionally keep the Ledger's raw template syntax unresolved
// ({minCount}, {window}, {?minCount}...{/minCount} conditionals, {key:suffix} pluralization) —
// nothing in the UI currently renders `achievements.description` at all (grepped: no component
// reads this field), so there is no resolver to feed a pre-resolved string into, and the schema
// only has one description slot per achievement (not per-tier), which a template can express but
// a baked-in resolved string can't. Wiring up a real template renderer is a follow-up, not done
// here — this keeps the stored data faithful to the source of truth in the meantime.
const FOR_THE_HORDE: AchievementDefinition = {
  name: "For the Horde",
  description: "Earned {minPercent}% attendance credit over 6 consecutive season weeks.",
  goalDescription: "Earn {minPercent}% attendance credit over 6 consecutive season weeks.",
  icon: "inv_hordewareffort",
  scope: "season",
  hidden: false,
  tiers: {
    copper: { shape: "weighted_attendance_threshold", minPercent: 50, lockoutWeeks: 6 },
    silver: { shape: "weighted_attendance_threshold", minPercent: 75, lockoutWeeks: 6 },
    gold: { shape: "weighted_attendance_threshold", minPercent: 90, lockoutWeeks: 6 },
    thorium: { shape: "weighted_attendance_threshold", minPercent: 100, lockoutWeeks: 6 },
  },
};

const STEADFAST: AchievementDefinition = {
  name: "Steadfast",
  description:
    "Signed up early and attended with that same class{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  goalDescription:
    "Sign up early and attend with that same class{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  icon: "inv_shield_26",
  scope: "season",
  hidden: false,
  tiers: {
    copper: { shape: "consistency_match", minCount: 1 },
    silver: { shape: "consistency_match", minCount: 5 },
    gold: { shape: "consistency_match", minCount: 10 },
    thorium: { shape: "consistency_match", minCount: 20 },
  },
};

const FLEXIBLE: AchievementDefinition = {
  name: "Flexible",
  description:
    "Swapped classes to balance raid comp (Signup vs. Attendance){?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  goalDescription:
    "Swap classes to balance raid comp (Signup vs. Attendance){?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  icon: "achievement_general_stayclassy",
  scope: "season",
  hidden: false,
  tiers: {
    copper: { shape: "flexibility_match", minCount: 1 },
    silver: { shape: "flexibility_match", minCount: 5 },
    gold: { shape: "flexibility_match", minCount: 10 },
    thorium: { shape: "flexibility_match", minCount: 20 },
  },
};

const PUT_ME_IN_COACH: AchievementDefinition = {
  name: "On Deck",
  description: "Earned bench credit{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  goalDescription: "Earn bench credit{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  icon: "ui_mission_itemupgrade",
  scope: "season",
  hidden: false,
  tiers: {
    copper: { shape: "bench_credit_count", minCount: 1 },
    silver: { shape: "bench_credit_count", minCount: 5 },
    gold: { shape: "bench_credit_count", minCount: 10 },
    thorium: { shape: "bench_credit_count", minCount: 20 },
  },
};

const ZONE_ACHIEVEMENTS: Array<{
  name: string;
  zone: string;
  icon: string;
}> = [
  { name: "Flameeater", zone: "Molten Core", icon: "achievement_boss_ragnaros" },
  { name: "Dragonslayer", zone: "Blackwing Lair", icon: "achievement_boss_nefarion" },
  { name: "Exterminator", zone: "Temple of Ahn'Qiraj", icon: "achievement_boss_cthun" },
  { name: "Plaguebreaker", zone: "Naxxramas", icon: "achievement_boss_kelthuzad_01" },
];

function zoneAttendanceDefinition(
  entry: (typeof ZONE_ACHIEVEMENTS)[number],
): AchievementDefinition {
  return {
    name: entry.name,
    description: "Raided {zone}{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Raid {zone}{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: entry.icon,
    scope: "season",
    hidden: false,
    tiers: {
      copper: { shape: "zone_attendance_threshold", zone: entry.zone, minCount: 1 },
      silver: { shape: "zone_attendance_threshold", zone: entry.zone, minCount: 5 },
      gold: { shape: "zone_attendance_threshold", zone: entry.zone, minCount: 10 },
      thorium: { shape: "zone_attendance_threshold", zone: entry.zone, minCount: 20 },
    },
  };
}

const GRASS_TO_TOUCH: AchievementDefinition = {
  name: "There's grass to touch in Azeroth",
  description: "Raided {minRaidsInOneWeek} time{minRaidsInOneWeek:s} in a single lockout week.",
  icon: "inv_misc_herb_05",
  scope: "season",
  hidden: true,
  tiers: {
    silver: { shape: "raid_marathon_density", minRaidsInOneWeek: 3, lockoutWeeks: 1 },
    gold: { shape: "raid_marathon_density", minRaidsInOneWeek: 5, lockoutWeeks: 1 },
    thorium: { shape: "raid_marathon_density", minRaidsInOneWeek: 10, lockoutWeeks: 1 },
  },
};

const SHOW_YOU_THE_WORLD: AchievementDefinition = {
  name: "I can show you the world",
  description:
    "Raided {minDistinctZones} unique zone{minDistinctZones:s} in a single lockout week.",
  icon: "inv_misc_map02",
  scope: "season",
  hidden: true,
  tiers: {
    copper: { shape: "zone_breadth_window", minDistinctZones: 3, lockoutWeeks: 1 },
    silver: { shape: "zone_breadth_window", minDistinctZones: 4, lockoutWeeks: 1 },
    gold: { shape: "zone_breadth_window", minDistinctZones: 5, lockoutWeeks: 1 },
    thorium: { shape: "zone_breadth_window", minDistinctZones: 7, lockoutWeeks: 1 },
  },
};

const SHAPESHIFTER: AchievementDefinition = {
  name: "Shapeshifter",
  description: "Raided with {minDistinctClasses} different class{minDistinctClasses:es} {window}.",
  icon: "ability_mage_improvedpolymorph",
  scope: "season",
  hidden: true,
  tiers: {
    silver: { shape: "class_breadth_window", minDistinctClasses: 2 },
    gold: { shape: "class_breadth_window", minDistinctClasses: 4 },
    thorium: { shape: "class_breadth_window", minDistinctClasses: 6 },
    arcanite: { shape: "class_breadth_window", minDistinctClasses: 8 },
  },
};

const MAKE_EM_SEE_DOUBLE: AchievementDefinition = {
  name: "Make 'em see double",
  description:
    "Brought 2 different characters to a raid{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
  icon: "spell_nature_mirrorimage",
  scope: "season",
  hidden: true,
  tiers: {
    silver: { shape: "family_double_up_cooccurrence", minCount: 3 },
    gold: { shape: "family_double_up_cooccurrence", minCount: 6 },
    thorium: { shape: "family_double_up_cooccurrence", minCount: 10 },
    arcanite: { shape: "family_double_up_cooccurrence", minCount: 20 },
  },
};

// The 8 Horde-playable classes (no Paladin in Classic). Thresholds and description templates
// come straight from the Ledger, including the class-specific flavor text.
const CLASS_ACHIEVEMENTS: Array<{
  name: string;
  class: string;
  description: string;
  goalDescription: string;
  icon: string;
}> = [
  {
    name: "Bam Bam",
    class: "Warrior",
    description: "Your {class} zugged{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Zug{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_warrior",
  },
  {
    name: "Lock and Load",
    class: "Hunter",
    description:
      "Your {class} shot things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Shoot things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_hunter",
  },
  {
    name: "From Shadows",
    class: "Rogue",
    description:
      "Your {class} stabbed things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Stab things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_rogue",
  },
  {
    name: "Flash! Ah-Ahh!",
    class: "Priest",
    description:
      "Your {class} healed things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Heal things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_priest",
  },
  {
    name: "Woodchuck",
    class: "Shaman",
    description:
      "Your {class} slung totems{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Sling totems{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_shaman",
  },
  {
    name: "Icy Hot",
    class: "Mage",
    description:
      "Your {class} froze and/or burned things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription:
      "Freeze and/or burn things{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_mage",
  },
  {
    name: "Hex Appeal",
    class: "Warlock",
    description:
      "Your {class} baked cookies{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription: "Bake cookies{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_warlock",
  },
  {
    name: "Knight of Ni",
    class: "Druid",
    description:
      "Your {class} demanded a shrubbery{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    goalDescription:
      "Demand a shrubbery{?minCount} {minCount} time{minCount:s} {window}{/minCount}.",
    icon: "classicon_druid",
  },
];

function classAttendanceDefinition(
  entry: (typeof CLASS_ACHIEVEMENTS)[number],
): AchievementDefinition {
  return {
    name: entry.name,
    description: entry.description,
    goalDescription: entry.goalDescription,
    icon: entry.icon,
    scope: "season",
    hidden: false,
    tiers: {
      copper: { shape: "class_attendance_threshold", class: entry.class, minCount: 1 },
      silver: { shape: "class_attendance_threshold", class: entry.class, minCount: 5 },
      gold: { shape: "class_attendance_threshold", class: entry.class, minCount: 10 },
      thorium: { shape: "class_attendance_threshold", class: entry.class, minCount: 25 },
      arcanite: { shape: "class_attendance_threshold", class: entry.class, minCount: 50 },
    },
  };
}

// All-time capstone: a single Arcanite-only tier, unbounded window — proves the season/all-time
// scope dimension and the tier-disable pattern (copper/silver/gold/thorium simply absent) are
// config toggles, not new engineering. 8 Horde-playable classes across all of history.
const EVERY_CLASS_ALL_TIME: AchievementDefinition = {
  name: "Sixty-nine, dudes!",
  description: "Raided with all 8 horde classes. Excellent! 🎸 🤘",
  icon: "inv_misc_head_dragon_01",
  scope: "all_time",
  hidden: true,
  tiers: {
    arcanite: { shape: "class_breadth_window", minDistinctClasses: 8 },
  },
};

export function getAchievementDefinitions(): AchievementDefinition[] {
  return [
    FOR_THE_HORDE,
    STEADFAST,
    FLEXIBLE,
    PUT_ME_IN_COACH,
    ...ZONE_ACHIEVEMENTS.map(zoneAttendanceDefinition),
    GRASS_TO_TOUCH,
    SHOW_YOU_THE_WORLD,
    SHAPESHIFTER,
    MAKE_EM_SEE_DOUBLE,
    ...CLASS_ACHIEVEMENTS.map(classAttendanceDefinition),
    EVERY_CLASS_ALL_TIME,
  ];
}

/** Seeds every rule-based achievement definition, each tier's config included. Distinct from the
 *  admin panel's manual-grant `createAchievement` (no rule attached) — this is the code-level
 *  seeding path for the real, finalized catalog. Idempotent per-definition, not just per-run: an
 *  interrupted prior call (crash, transient DB error) can leave some definitions inserted and
 *  others not, so this skips only the names that already exist rather than an all-or-nothing
 *  batch check — a re-run always converges to the full catalog regardless of where a previous
 *  attempt stopped. */
export async function seedAchievementDefinitions(
  db: DB,
  seasonId: string,
  actingUserId?: string,
): Promise<{ achievementIds: string[] }> {
  const definitions = getAchievementDefinitions();
  const existing = await db.query.achievements.findMany({
    where: inArray(
      achievements.name,
      definitions.map((d) => d.name),
    ),
    columns: { name: true },
  });
  const existingNames = new Set(existing.map((a) => a.name));

  const achievementIds: string[] = [];
  for (const definition of definitions) {
    if (existingNames.has(definition.name)) continue;
    const tierConfigs = Object.values(definition.tiers) as AchievementRuleConfig[];
    const ruleShape = tierConfigs[0]?.shape ?? null;

    // Transactional: without this, a crash between the achievement insert and its tier-insert
    // loop leaves a tier-less achievement whose name now exists — the existingNames check above
    // would then skip it forever on every future retry, contradicting this function's own
    // convergence guarantee.
    const achievementId = await db.transaction(async (tx) => {
      const [achievement] = await tx
        .insert(achievements)
        .values({
          name: definition.name,
          description: definition.description,
          goalDescription: definition.goalDescription ?? null,
          icon: definition.icon,
          scope: definition.scope,
          seasonId: definition.scope === "season" ? seasonId : null,
          ruleShape,
          hidden: definition.hidden,
          createdById: actingUserId ?? null,
        })
        .returning();

      for (const [tier, config] of Object.entries(definition.tiers) as Array<
        [keyof AchievementDefinition["tiers"], AchievementRuleConfig]
      >) {
        await tx.insert(achievementTiers).values({
          achievementId: achievement!.id,
          tier: tier as "copper" | "silver" | "gold" | "thorium" | "arcanite",
          ruleConfig: config,
        });
      }

      return achievement!.id;
    });
    achievementIds.push(achievementId);
  }
  return { achievementIds };
}
