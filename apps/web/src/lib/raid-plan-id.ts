// 8 chars (62^8 ≈ 218 trillion combinations) is plenty for this app's volume — nanoid's
// default of 21 is sized for systems minting millions of IDs; a guild raid planner isn't
// that. Shared with raid-plan-schema.ts (the column length + $defaultFn) and
// raid-plan-id-retry.ts (regenerating on the rare PK collision).
export const RAID_PLAN_ID_LENGTH = 8;

// Letters and digits only — no `-`/`_`, so an id never reads as a word-break or gets
// mistaken for punctuation when written out (Discord, voice, etc). Shared with
// raid-plan-schema.ts ($defaultFn's customAlphabet) and the SQL backfill migrations'
// hand-rolled generator, which must stay in lockstep with this alphabet.
export const RAID_PLAN_ID_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Raid plan IDs are nanoids going forward, but plans created before the UUID->nanoid
 * migration keep resolving via their original UUID (preserved in `raid_plan.legacy_uuid`),
 * so any path/param carrying a plan ID may still legitimately be in either format.
 */
export const RAID_PLAN_ID_PATTERN = new RegExp(
  `^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{${RAID_PLAN_ID_LENGTH}})$`,
  "i",
);

const UUID_ONLY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegacyRaidPlanUuid(id: string): boolean {
  return UUID_ONLY_PATTERN.test(id);
}
