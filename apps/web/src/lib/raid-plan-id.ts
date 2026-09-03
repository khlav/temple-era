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

// Unanchored source, so it can be embedded inside a larger pattern (e.g. matching a plan
// ID out of a full pathname) as well as used standalone via RAID_PLAN_ID_PATTERN below.
const RAID_PLAN_ID_SEGMENT_SOURCE = `[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{${RAID_PLAN_ID_LENGTH}}`;

/**
 * Raid plan IDs are nanoids going forward, but plans created before the UUID->nanoid
 * migration keep resolving via their original UUID (preserved in `raid_plan.legacy_uuid`),
 * so any path/param carrying a plan ID may still legitimately be in either format. Use this
 * ONLY where the id is actually resolved against legacy_uuid before use (the raid-plans/
 * raid-manager page routes, the v1 REST handlers, and getById/getPublicById) — everywhere
 * else, a canonical id is guaranteed by construction (always sourced from a fresh query
 * result, never a raw URL param), so RAID_PLAN_NANOID_PATTERN is the correct, narrower
 * check: accepting a legacy UUID there would pass validation but never match any row.
 */
export const RAID_PLAN_ID_PATTERN = new RegExp(`^(${RAID_PLAN_ID_SEGMENT_SOURCE})$`, "i");

/** Canonical nanoid only — no legacy-UUID alternative. See RAID_PLAN_ID_PATTERN above. */
export const RAID_PLAN_NANOID_PATTERN = new RegExp(`^[A-Za-z0-9]{${RAID_PLAN_ID_LENGTH}}$`, "i");

/** Matches a raid plan ID (either format) as a substring — e.g. out of a full pathname. */
export const RAID_PLAN_ID_SEGMENT_PATTERN = new RegExp(`(${RAID_PLAN_ID_SEGMENT_SOURCE})`, "i");

const UUID_ONLY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isLegacyRaidPlanUuid(id: string): boolean {
  return UUID_ONLY_PATTERN.test(id);
}
