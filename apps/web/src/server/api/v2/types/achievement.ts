// src/server/api/v2/types/achievement.ts
import { EarnedAchievementRef, EarnedAchievementTierRef } from "../refs";

EarnedAchievementTierRef.implement({
  description: "One tier of an achievement that a character family has crossed or been granted.",
  fields: (t) => ({
    tier: t.exposeString("tier", {
      nullable: false,
      description: "Tier name, lowest to highest: copper, silver, gold, thorium, arcanite.",
    }),
    awardedAt: t.string({
      nullable: false,
      description: "When the tier was awarded (ISO 8601, UTC).",
      resolve: (tier) => tier.awardedAt.toISOString(),
    }),
    source: t.exposeString("source", {
      nullable: false,
      description:
        '"rule" when the achievement engine computed it, "manual" when an admin granted it.',
    }),
  }),
});

EarnedAchievementRef.implement({
  description:
    "An achievement a character family has earned, with every tier crossed folded in. Earned " +
    "only: a hidden achievement appears here once earned, the same as on the site.",
  fields: (t) => ({
    id: t.exposeString("achievementId", { nullable: false }),
    name: t.exposeString("name", { nullable: false }),
    description: t.exposeString("description", {
      nullable: false,
      description: "Resolved against the highest earned tier. Empty when there is no description.",
    }),
    icon: t.exposeString("icon", { nullable: false }),
    scope: t.exposeString("scope", {
      nullable: false,
      description: '"season" or "all_time".',
    }),
    seasonName: t.exposeString("seasonName", {
      nullable: true,
      description: "The season a season-scoped achievement belongs to; null for all-time ones.",
    }),
    hidden: t.exposeBoolean("hidden", { nullable: false }),
    highestTier: t.exposeString("highestTier", {
      nullable: false,
      description: "Highest tier earned: copper, silver, gold, thorium or arcanite.",
    }),
    tiers: t.field({
      type: [EarnedAchievementTierRef],
      nullable: false,
      description: "Every tier earned, lowest first.",
      resolve: (achievement) => achievement.tiers,
    }),
  }),
});
