# Implementation Spec: Achievement Engine - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

This phase lays the entire permanent data model the rest of the project builds on: `season`, `achievement`, `achievement_tier`, `achievement_award`, plus the `achievement:manage` scope and the two-step manual-grant tRPC flow. No rule evaluation lands here — every tier row created in this phase has `ruleConfig: null` (manually granted), and every achievement created here has `ruleShape: null`. Phase 2 is the only phase that ever inserts a non-null `ruleConfig`/`ruleShape`.

The schema follows this codebase's established Drizzle conventions exactly (see `raid-signup-link-schema.ts` and `raid-schema.ts`'s `characters` table for the reference patterns): `pgTableCreator`, the shared `IdPkAsUUID`/`CreatedBy`/`DefaultTimestamps` helper spreads, `pgEnum` for closed string-shaped columns (per `AGENTS.md`'s closed-enum convention, not open text), and a `relations()` block per table. Permanence and idempotency both come from one design choice: `achievement_award` has a unique index on `(achievementTierId, primaryCharacterId)` — a tier can only ever be crossed once per family, by construction, and "current highest tier per achievement" is a plain join/group-by over that table, no ratchet logic needed.

The router follows the `world-buff.ts` pattern: thin `scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)` mutations that delegate to a service module, wrapped in try/catch funneling through `toTRPCError`. `markSeen` is the one procedure NOT scope-gated — any authenticated user can mark their own family's awards seen.

## Decisions Considered and Rejected

_Carried from the contract — all entries are potentially relevant to this phase since it's the foundation every other phase builds on._

- **Rip out and replace Season 1's badge system entirely, archiving old definitions/rules to documentation only** — rejected: Coexist alongside the new permanent achievement system. User explicitly said "no need to preserve anything more than documentation" — avoids maintaining two parallel recognition systems.
- **Recipes are manual-grant only, no rule engine involvement** — rejected: Rule-evaluate recipe knowledge like the other datasets. Recipe data is self-reported and can be temporarily faked, unsuitable for automated verification.
- **Evaluation window granularity lives on the tier row (per-tier), not the achievement row** — rejected: One window per achievement, shared by all tiers. User said window design "will depend on the achievements we define" — per-tier is a strict superset that doesn't foreclose future flexibility. (This is why `ruleConfig` lives on `achievement_tier`, not `achievement`.)
- **Real season entity with start/end dates; achievements re-earnable per season** — rejected: Hardcode Season 2's start date as a constant. Cheap now, avoids a painful migration when Season 3 launches.
- **Attribution is family-level (`primaryCharacterId`) — matches how attendance already aggregates across a character's alts** — rejected: Character-level attribution (one award row per specific character). A same-day orphaned contract had already independently reached family-level attribution for the same feature; confirmed over character-level once surfaced.
- **Permanence is append-per-crossing — a new row for every tier crossed, never overwritten** — rejected: Ratchet — one row per season updated in place to the highest tier reached. Matches the mockup's per-crossing reveal ceremony and lets each crossing be individually replayed; "current highest tier" stays trivially queryable.
- **A rule engine covering 9 generalized shapes is core scope, not hardcoded per-achievement logic** — rejected: Hardcoded evaluation with no rule engine. This session's interview drove toward an explicit, reusable rule-shape taxonomy — superseding an earlier, less-informed exclusion. (This phase creates the `ruleShape` column the engine will discriminate on in Phase 2, but does not populate it.)
- **Achievements can be hidden or visible; visible ones show highest-tier-earned plus a progress bar; hidden ones occupy no display space until first earned** — rejected: All achievements always visible with a locked/grayed state, no hidden concept. User specified this directly. (This phase adds the `hidden` boolean column; Phase 3 consumes it.)
- **Editing or retuning rule-based achievement definitions through an admin UI is out of scope** — rejected: n/a (out-of-scope call, not a rejected alternative). Rule-based achievements are permanently code-based; the admin UI's only job is this phase's manual-grant flow for custom, non-rule awards.

## Feedback Strategy

**Inner-loop command**: `pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts`

**Playground**: Vitest with the codebase's established DB-mocking pattern (`vi.hoisted()` + `vi.mock("~/server/db", ...)`, per `raid-signup-link-matching.test.ts`) for the router/service logic; `pnpm --filter temple-era-web typecheck` for the schema itself.

**Why this approach**: The schema is write-once (typecheck is sufficient), but the two-step manual-grant flow has real branching logic (scope gating, uniqueness-conflict handling, season-required-for-season-scope validation) that benefits from a fast, scoped test loop.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `apps/web/src/server/db/models/achievement-schema.ts` | `season`, `achievement`, `achievement_tier`, `achievement_award` tables, their enums, and `relations()` blocks |
| `apps/web/src/server/services/achievement-service.ts` | `createAchievement`, `grantAchievement`, `markAchievementAwardsSeen` — business logic behind the router |
| `apps/web/src/server/api/routers/achievement.ts` | tRPC router: `createAchievement`, `grantAchievement`, `markSeen`, plus read procedures (`listAchievements`, `listAwardsForFamily`) that Phase 3 will consume |
| `apps/web/src/server/api/routers/__tests__/achievement.test.ts` | Router/service tests — manual-grant scope gating, repeat-grant idempotency, mark-seen scoping |
| `apps/web/drizzle/{timestamp}_achievement_engine.sql` | Drizzle-kit-generated migration for the four new tables + `achievement:manage` added to the scope enum |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/server/db/schema.ts` | Add `import * as AchievementSchema from "~/server/db/models/achievement-schema"` and the grouped `export const { Tables, Relations, Enums } = AchievementSchema` block, following the existing per-module aggregation pattern |
| `apps/web/src/lib/scopes.ts` | Add `ACHIEVEMENT_MANAGE: "achievement:manage"` to `SCOPE`, and to the `SCOPES` tuple (the exhaustiveness guard forces this) |
| `apps/web/src/components/admin/role-editor.tsx` | Add an entry to `SCOPE_DESCRIPTIONS: Record<Scope, string>` for `SCOPE.ACHIEVEMENT_MANAGE` (the `Record<Scope, string>` typing makes omitting this a compile error, so it can't be forgotten) |
| `apps/web/src/server/api/root.ts` | Register the new router: `achievement: achievementRouter` |

## Implementation Details

### Schema: season, achievement, achievement_tier, achievement_award

**Pattern to follow**: `apps/web/src/server/db/models/raid-signup-link-schema.ts` (FK + enum + relations shape), `apps/web/src/server/db/models/raid-schema.ts` (self-referencing FK via `foreignKey({ columns, foreignColumns, name })`, and the `characters.primaryCharacterId` column this schema attributes to)

**Overview**: Four tables. `season` is a plain date-range record. `achievement` is the definition (name/icon/scope/hidden/ruleShape — ruleShape null in this phase). `achievement_tier` holds one row per tier level of an achievement, with `ruleConfig` null for every row this phase creates (Phase 2 populates it for rule-based achievements). `achievement_award` is the permanent, append-only fact table: one row per family per tier ever crossed or granted.

```typescript
export const achievementScopeEnum = pgEnum("achievement_scope", ["season", "all_time"]);
export const achievementTierLevelEnum = pgEnum("achievement_tier_level", ["bronze", "silver", "gold", "platinum"]);
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

export const seasons = tableCreator("season", {
  ...IdPkAsUUID,
  name: varchar("name", { length: 128 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }),
  ...CreatedBy,
  ...DefaultTimestamps,
});

export const achievements = tableCreator("achievement", {
  ...IdPkAsUUID,
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  icon: varchar("icon", { length: 128 }).notNull(),
  scope: achievementScopeEnum("scope").notNull(),
  seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "restrict" }),
  ruleShape: achievementRuleShapeEnum("rule_shape"), // null = manual-grant-only achievement
  hidden: boolean("hidden").notNull().default(false),
  ...CreatedBy,
  ...DefaultTimestamps,
});

export const achievementTiers = tableCreator(
  "achievement_tier",
  {
    ...IdPkAsUUID,
    achievementId: uuid("achievement_id").notNull().references(() => achievements.id, { onDelete: "cascade" }),
    tier: achievementTierLevelEnum("tier").notNull(),
    ruleConfig: jsonb("rule_config").$type<AchievementRuleConfig>(), // null = manual-grant-only tier
    ...DefaultTimestamps,
  },
  (table) => ({
    achievementTierUnique: uniqueIndex("achievement_tier__achievement_id_tier_idx").on(table.achievementId, table.tier),
  }),
);

export const achievementAwards = tableCreator(
  "achievement_award",
  {
    ...IdPkAsUUID,
    achievementTierId: uuid("achievement_tier_id").notNull().references(() => achievementTiers.id, { onDelete: "restrict" }),
    primaryCharacterId: integer("primary_character_id").notNull().references(() => characters.characterId, { onDelete: "restrict" }),
    source: achievementAwardSourceEnum("source").notNull(),
    awardedAt: timestamp("awarded_at", { withTimezone: true }).notNull().defaultNow(),
    awardedByUserId: varchar("awarded_by_user_id", { length: 255 }), // null for source = "rule"
    seenAt: timestamp("seen_at", { withTimezone: true }),
    ...DefaultTimestamps,
  },
  (table) => ({
    crossingUnique: uniqueIndex("achievement_award__tier_primary_character_idx").on(table.achievementTierId, table.primaryCharacterId),
    primaryCharacterIdx: index("achievement_award__primary_character_id_idx").on(table.primaryCharacterId),
  }),
);
```

**Key decisions**:

- `ruleConfig` is `jsonb`, typed via `.$type<AchievementRuleConfig>()` (a discriminated union Phase 2 defines, keyed by `achievementRuleShapeEnum`'s values) — this phase only needs it to exist as a column; it stays `null` for every row inserted here.
- `achievement.seasonId` is nullable specifically because `scope = "all_time"` achievements have no season. Enforce `scope = "season" ⟹ seasonId IS NOT NULL` at the service layer (a `CHECK` constraint referencing two columns needs a raw SQL check clause — acceptable, but service-layer validation is simpler and gives a better error message; note as an Open Item below if a DB-level check is wanted later).
- The `crossingUnique` index on `(achievementTierId, primaryCharacterId)` is the single mechanism providing BOTH idempotency (a repeat insert conflicts) and append-per-crossing correctness (two different tiers of the same achievement are two different `achievementTierId`s, so both rows coexist).
- `awardedByUserId` has no FK per this schema pass — cross-check against the `users` table's actual PK type during implementation (the codebase's `users` table wasn't in this phase's research scope) and add the FK if types line up.

**Implementation steps**:

1. Write `achievement-schema.ts` with the four tables above.
2. Wire into `schema.ts` per the existing aggregation pattern.
3. Run `pnpm --filter temple-era-web db:generate` (or the project's drizzle-kit generate script) to produce the migration; hand-verify the generated SQL matches the manual-constraint-naming convention (`AGENTS.md` notes Postgres's 63-byte identifier limit — the constraint names above are all under it).
4. Add `achievement:manage` to whatever Postgres enum backs the scopes system (the same migration, or a follow-up statement in it) — confirm the exact enum name during implementation; `scopes.ts`'s comment says `SCOPES` order must stay in sync with it.

### achievement:manage scope + role-editor wiring

**Pattern to follow**: `apps/web/src/lib/scopes.ts` (existing `SCOPE`/`SCOPES` shape), `apps/web/src/components/admin/role-editor.tsx` (`SCOPE_DESCRIPTIONS` map)

**Overview**: One new scope, following the exact `<resource>:manage` naming convention already used by `raidlog:manage`, `character:manage`, etc.

```typescript
export const SCOPE = {
  // ...existing entries
  ACHIEVEMENT_MANAGE: "achievement:manage",
} as const;
```

**Key decisions**:

- No new naming pattern introduced — `achievement:manage` slots directly into the existing `<resource>:manage` family.

**Implementation steps**:

1. Add `ACHIEVEMENT_MANAGE` to `SCOPE` and `SCOPES` in `scopes.ts` (the `ScopesMissingFromTuple` compile-time guard will fail the build if `SCOPES` is forgotten).
2. Add a description string to `role-editor.tsx`'s `SCOPE_DESCRIPTIONS` map (the `Record<Scope, string>` typing makes this a compile error if skipped).

### Two-step manual grant: createAchievement / grantAchievement / markSeen

**Pattern to follow**: `apps/web/src/server/api/routers/world-buff.ts`'s `createAssignment` (thin `scopedProcedure` → service call → `toTRPCError` on failure)

**Overview**: `createAchievement` defines one achievement + exactly one tier row in a single call (name/icon/tier/scope/hidden — matches the contract's literal field list). `grantAchievement` creates one `achievement_award` row for a given family against an existing manual (non-rule) tier, repeatable across families over time. `markSeen` is unscoped (any authenticated user) and updates `seenAt` on the caller's own family's award rows.

```typescript
// achievement-service.ts
interface CreateAchievementInput {
  name: string;
  description?: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  scope: "season" | "all_time";
  seasonId?: string; // required when scope = "season"
  hidden: boolean;
}
async function createAchievement(input: CreateAchievementInput, actingUserId: string): Promise<{ achievementId: string; achievementTierId: string }>;

interface GrantAchievementInput {
  achievementTierId: string;
  primaryCharacterId: number;
}
async function grantAchievement(input: GrantAchievementInput, actingUserId: string): Promise<{ achievementAwardId: string }>;
// Throws AchievementServiceError("rule_managed") if the target tier's ruleConfig is non-null.
// Throws AchievementServiceError("already_awarded") on a crossingUnique conflict.

async function markAchievementAwardsSeen(achievementAwardIds: string[], callerPrimaryCharacterId: number): Promise<{ updated: number }>;
// Only updates rows whose primaryCharacterId === callerPrimaryCharacterId; silently no-ops on IDs that don't match (not an error — a stale client array shouldn't fail the whole call).
```

```typescript
// achievement.ts router
export const achievementRouter = createTRPCRouter({
  createAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(createAchievementInputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await createAchievement(input, ctx.session.user.id);
      } catch (error) {
        toTRPCError(error);
      }
    }),
  grantAchievement: scopedProcedure(SCOPE.ACHIEVEMENT_MANAGE)
    .input(z.object({ achievementTierId: z.string().uuid(), primaryCharacterId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await grantAchievement(input, ctx.session.user.id);
      } catch (error) {
        toTRPCError(error);
      }
    }),
  markSeen: protectedProcedure // NOT scoped — any authenticated user marks their own awards
    .input(z.object({ achievementAwardIds: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const callerPrimaryCharacterId = await resolveSessionPrimaryCharacterId(ctx.session); // see Open Items
      return markAchievementAwardsSeen(input.achievementAwardIds, callerPrimaryCharacterId);
    }),
});
```

**Key decisions**:

- `createAchievement` takes exactly one `tier`, not a full ladder — matches the contract's literal description ("create a custom award definition (name, icon, tier, ...)"). An officer wanting the same conceptual award at a second tier for a different recipient creates a second `createAchievement` call; there is no cross-tier linkage for manual achievements.
- `grantAchievement` rejects rule-managed tiers (`ruleConfig IS NOT NULL`) so the manual flow can never collide with or shadow an automated crossing — keeps the two award sources ("rule" vs "manual") cleanly separated per `achievement_award.source`.
- A repeat `grantAchievement` call for the same `(achievementTierId, primaryCharacterId)` pair is a domain error, not a silent no-op — unlike Phase 2's rule evaluation (which is expected to re-run and must be idempotent), a human clicking "grant" twice is more likely a mistake worth surfacing.

**Implementation steps**:

1. Write `achievement-service.ts`'s three functions plus a small `AchievementServiceError` class (mirroring `WorldBuffServiceError`'s role in `toTRPCError`).
2. Write the router with the three mutations above, plus `listAchievements`/`listAwardsForFamily` read procedures (unscoped reads — Phase 3's display components and Phase 1's own admin UI both need them; define their shape now so Phase 3 isn't blocked on a schema surface not yet decided).
3. Build a minimal admin UI (new page or section under the existing admin area) for `createAchievement` + `grantAchievement` — a form for the former, a searchable-family picker + tier-list picker for the latter. Exact page location/route: follow whatever pattern `role-editor.tsx`'s own host page uses (same admin section).

**Feedback loop**:

- **Playground**: `achievement.test.ts` with the `vi.hoisted()` DB-mock pattern from `raid-signup-link-matching.test.ts`.
- **Experiment**: create → grant → grant-again-same-pair (expect conflict) → grant-to-a-different-family (expect success) → grant-against-a-rule-managed-tier (expect rejection) → call each mutation with an unscoped session (expect `FORBIDDEN`).
- **Check command**: `pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts -t manual-grant`

## Data Model

### Schema Changes

```sql
CREATE TYPE achievement_scope AS ENUM ('season', 'all_time');
CREATE TYPE achievement_tier_level AS ENUM ('bronze', 'silver', 'gold', 'platinum');
CREATE TYPE achievement_rule_shape AS ENUM (
  'attendance_threshold', 'consistency_match', 'flexibility_match', 'bench_credit_count',
  'zone_attendance_threshold', 'raid_marathon_density', 'zone_breadth_window',
  'class_breadth_window', 'family_double_up_cooccurrence'
);
CREATE TYPE achievement_award_source AS ENUM ('rule', 'manual');

CREATE TABLE season (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE achievement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(128) NOT NULL,
  description VARCHAR(512),
  icon VARCHAR(128) NOT NULL,
  scope achievement_scope NOT NULL,
  season_id UUID REFERENCES season(id),
  rule_shape achievement_rule_shape,
  hidden BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE achievement_tier (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id UUID NOT NULL REFERENCES achievement(id) ON DELETE CASCADE,
  tier achievement_tier_level NOT NULL,
  rule_config JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX achievement_tier__achievement_id_tier_idx ON achievement_tier(achievement_id, tier);

CREATE TABLE achievement_award (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_tier_id UUID NOT NULL REFERENCES achievement_tier(id),
  primary_character_id INTEGER NOT NULL REFERENCES character(character_id),
  source achievement_award_source NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  awarded_by_user_id VARCHAR(255),
  seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX achievement_award__tier_primary_character_idx ON achievement_award(achievement_tier_id, primary_character_id);
CREATE INDEX achievement_award__primary_character_id_idx ON achievement_award(primary_character_id);
```

## API Design

### New tRPC Procedures (`achievement` router)

| Procedure | Type | Scope | Description |
| --- | --- | --- | --- |
| `createAchievement` | mutation | `achievement:manage` | Defines one achievement + one tier, no rule attached |
| `grantAchievement` | mutation | `achievement:manage` | Grants a manual (non-rule) tier to a family; repeatable across families |
| `markSeen` | mutation | none (own-family only) | Marks `seenAt` on the caller's own award rows |
| `listAchievements` | query | none | Reads achievement + tier catalog, for admin UI and Phase 3's display components |
| `listAwardsForFamily` | query | none | Reads a family's awards (with tier/achievement joined), for Phase 3 |

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `apps/web/src/server/api/routers/__tests__/achievement.test.ts` | `createAchievement`/`grantAchievement` scope gating, repeat-grant conflict, rule-managed-tier rejection, `markSeen` own-family scoping and idempotency |

**Key test cases**:

- `createAchievement` with `scope: "season"` and no `seasonId` → rejected (service-layer validation, not a DB constraint).
- `grantAchievement` called twice with the same `(achievementTierId, primaryCharacterId)` → second call rejected as `already_awarded`.
- `grantAchievement` called with the same `achievementTierId` but two different `primaryCharacterId`s → both succeed (repeatable-over-time grant).
- `grantAchievement` against a tier with non-null `ruleConfig` → rejected as `rule_managed`.
- Any of the three scoped mutations called with a session lacking `achievement:manage` → `FORBIDDEN`.
- `markSeen` with an award ID belonging to a different family → silently excluded from the update, not an error.
- `markSeen` called twice on the same award ID → second call is a no-op, `updated: 0`.

### Manual Testing

- [ ] Create a manual achievement via the admin UI, grant it to a test family, confirm it appears via `listAwardsForFamily`.
- [ ] Attempt the same actions as a session without `achievement:manage` — confirm rejection surfaces cleanly in the UI.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `createAchievement` | Season-scoped achievement created with a dangling/future `seasonId` | Caller passes a `seasonId` for a season that doesn't exist yet | FK violation surfaces as a raw DB error | Validate `seasonId` exists via a lookup before insert; return a clean domain error |
| `grantAchievement` | Race between two concurrent grants for the same pair | Two admin tabs submit the same grant near-simultaneously | One succeeds, one hits the unique-index conflict | Already handled — conflict maps to `already_awarded`, not a 500 |
| `markSeen` | Caller passes IDs belonging to another family | Stale client-side array after a family switch, or a malicious client | Must not leak or mutate another family's `seenAt` | Filter is `WHERE id IN (...) AND primary_character_id = :callerPrimaryCharacterId` — non-matching IDs are silently excluded, never erroring, never touching another family's row |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts
pnpm --filter temple-era-web build
```

## Rollout Considerations

- **Feature flag**: none — the schema and admin-only mutations are inert until Phase 3 exposes any of this to non-admin UI.
- **Monitoring**: none needed at this phase; Phase 4's QStash route is where evaluation volume becomes worth watching.
- **Rollback plan**: schema-only + admin-gated mutations — a straight migration rollback is safe since nothing else references these tables yet.

## Open Items

- [ ] Confirm the exact session→`primaryCharacterId` resolution helper (`resolveSessionPrimaryCharacterId` above is a placeholder name) — this codebase likely already has a "my own characters" pattern used elsewhere; find and reuse it rather than writing a new one.
- [ ] Confirm `users` table's PK type/name to decide whether `achievement_award.awarded_by_user_id` gets a real FK or stays a plain varchar.
- [ ] Confirm the exact name of the Postgres enum backing the scopes system, so `achievement:manage` gets added to the right migration.
- [ ] Confirm where the admin UI's other scope-gated management pages live (to place the new create/grant UI consistently) — `role-editor.tsx`'s host page is the closest known reference point but wasn't read in full this pass.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
