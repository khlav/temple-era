import { relations } from "drizzle-orm";
import {
  pgTableCreator,
  pgEnum,
  foreignKey,
  uniqueIndex,
  index,
  integer,
  uuid,
  varchar,
  boolean,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { IdPkAsUUID, CreatedBy, DefaultTimestamps } from "~/server/db/helpers";
import { characters } from "~/server/db/models/raid-schema";
import { users } from "~/server/db/models/auth-schema";

const tableCreator = pgTableCreator((name) => name);

export const achievementScopeEnum = pgEnum("achievement_scope", ["season", "all_time"]);
export const achievementTierLevelEnum = pgEnum("achievement_tier_level", [
  "bronze",
  "silver",
  "gold",
  "platinum",
]);
// One value per rule shape identified in the achievement-engine ideation contract. Null on
// `achievement.ruleShape` means the achievement is manual-grant-only (no rule ever evaluates it).
export const achievementRuleShapeEnum = pgEnum("achievement_rule_shape", [
  "attendance_threshold",
  "consistency_match",
  "flexibility_match",
  "bench_credit_count",
  "zone_attendance_threshold",
  "raid_marathon_density",
  "zone_breadth_window",
  "class_breadth_window",
  "family_double_up_cooccurrence",
]);
export const achievementAwardSourceEnum = pgEnum("achievement_award_source", ["rule", "manual"]);

// Season 2's real start/end dates are seeded once known (see docs/ideation/achievement-engine).
// Every rule window resolves against a season row rather than a hardcoded date, so a rule can
// never accidentally credit pre-season data.
export const seasons = tableCreator("season", {
  ...IdPkAsUUID,
  name: varchar("name", { length: 128 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }),
  ...CreatedBy,
  ...DefaultTimestamps,
});

// One achievement can be rule-based (ruleShape set, tiers carry ruleConfig) or manual-grant-only
// (ruleShape null, tiers have null ruleConfig) — never both. `hidden` applies to the whole
// achievement, not per-tier: a hidden achievement has no display slot anywhere until the family
// earns its first tier of it.
export const achievements = tableCreator("achievement", {
  ...IdPkAsUUID,
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  icon: varchar("icon", { length: 128 }).notNull(),
  scope: achievementScopeEnum("scope").notNull(),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "restrict" }),
  ruleShape: achievementRuleShapeEnum("rule_shape"),
  hidden: boolean("hidden").notNull().default(false),
  ...CreatedBy,
  ...DefaultTimestamps,
});

// Window granularity lives here (per-tier), not on `achievement` — bronze and platinum tiers of
// the same achievement can each have their own lockout-week lookback size. `ruleConfig` is null
// for a manually-granted tier.
export const achievementTiers = tableCreator(
  "achievement_tier",
  {
    ...IdPkAsUUID,
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    tier: achievementTierLevelEnum("tier").notNull(),
    ruleConfig: jsonb("rule_config").$type<AchievementRuleConfig>(),
    ...DefaultTimestamps,
  },
  (table) => ({
    achievementIdTierUq: uniqueIndex("achievement_tier__achievement_id_tier_idx").on(
      table.achievementId,
      table.tier,
    ),
  }),
);

export const achievementTiersRelations = relations(achievementTiers, ({ one, many }) => ({
  achievement: one(achievements, {
    fields: [achievementTiers.achievementId],
    references: [achievements.id],
  }),
  awards: many(achievementAwards),
}));

export const achievementsRelations = relations(achievements, ({ one, many }) => ({
  season: one(seasons, { fields: [achievements.seasonId], references: [seasons.id] }),
  tiers: many(achievementTiers),
}));

// Permanent, append-per-crossing fact table — one row per family per tier ever crossed or
// granted, never overwritten. The unique index on (achievementTierId, primaryCharacterId) is the
// entire idempotency + append-per-crossing mechanism: a repeat rule evaluation conflicts (no-op),
// while a different tier of the same achievement is a different achievementTierId, so both rows
// coexist. "Current highest tier per achievement" is a plain join/group-by over this table.
export const achievementAwards = tableCreator(
  "achievement_award",
  {
    ...IdPkAsUUID,
    achievementTierId: uuid("achievement_tier_id")
      .notNull()
      .references(() => achievementTiers.id, { onDelete: "restrict" }),
    primaryCharacterId: integer("primary_character_id").notNull(),
    source: achievementAwardSourceEnum("source").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    // Null for source = "rule" — nothing to attribute a system-computed crossing to.
    awardedByUserId: uuid("awarded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // Null = unseen. Doubles as "when did they see it" — no separate boolean flag needed.
    seenAt: timestamp("seen_at", { withTimezone: true }),
    ...DefaultTimestamps,
  },
  (table) => ({
    crossingUq: uniqueIndex("achievement_award__tier_primary_character_idx").on(
      table.achievementTierId,
      table.primaryCharacterId,
    ),
    primaryCharacterIdIdx: index("achievement_award__primary_character_id_idx").on(
      table.primaryCharacterId,
    ),
    // Explicit shorter name — the default table+column+foreignTable+foreignColumn name for this
    // FK is over Postgres's 63-byte identifier limit (same issue world-buff-schema.ts hit).
    primaryCharacterIdFk: foreignKey({
      columns: [table.primaryCharacterId],
      foreignColumns: [characters.characterId],
      name: "achievement_award_primary_character_id_fk",
    }).onDelete("restrict"),
  }),
);

export const achievementAwardsRelations = relations(achievementAwards, ({ one }) => ({
  achievementTier: one(achievementTiers, {
    fields: [achievementAwards.achievementTierId],
    references: [achievementTiers.id],
  }),
  primaryCharacter: one(characters, {
    fields: [achievementAwards.primaryCharacterId],
    references: [characters.characterId],
  }),
  awardedBy: one(users, {
    fields: [achievementAwards.awardedByUserId],
    references: [users.id],
  }),
}));

export interface AchievementRuleConfigAttendanceThreshold {
  shape: "attendance_threshold";
  minPercent: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigConsistencyMatch {
  shape: "consistency_match";
  minCount: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigFlexibilityMatch {
  shape: "flexibility_match";
  minCount: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigBenchCreditCount {
  shape: "bench_credit_count";
  minCount: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigZoneAttendanceThreshold {
  shape: "zone_attendance_threshold";
  zone: string;
  minCount: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigRaidMarathonDensity {
  shape: "raid_marathon_density";
  minRaidsInOneWeek: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigZoneBreadthWindow {
  shape: "zone_breadth_window";
  minDistinctZones: number;
  lockoutWeeks: number;
}
export interface AchievementRuleConfigClassBreadthWindow {
  shape: "class_breadth_window";
  minDistinctClasses: number;
  lockoutWeeks?: number;
}
export interface AchievementRuleConfigFamilyDoubleUpCooccurrence {
  shape: "family_double_up_cooccurrence";
  minCount: number;
  lockoutWeeks: number;
}

/** Discriminated union stored in `achievement_tier.rule_config`. Phase 1 only declares the type
 *  (every row it inserts has `ruleConfig: null`); Phase 2's rule engine is the sole populator and
 *  consumer of real values. */
export type AchievementRuleConfig =
  | AchievementRuleConfigAttendanceThreshold
  | AchievementRuleConfigConsistencyMatch
  | AchievementRuleConfigFlexibilityMatch
  | AchievementRuleConfigBenchCreditCount
  | AchievementRuleConfigZoneAttendanceThreshold
  | AchievementRuleConfigRaidMarathonDensity
  | AchievementRuleConfigZoneBreadthWindow
  | AchievementRuleConfigClassBreadthWindow
  | AchievementRuleConfigFamilyDoubleUpCooccurrence;
