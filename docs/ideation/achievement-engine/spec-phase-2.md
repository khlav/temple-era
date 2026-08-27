# Implementation Spec: Achievement Engine - Phase 2

**Contract**: ./contract.md
**Estimated Effort**: XL

## Technical Approach

This is the highest-risk phase in the project — there's no precedent in this codebase for server-side rule evaluation at this complexity. The design strategy for managing that risk is to split the problem into three independent, separately-testable layers rather than one monolithic evaluator:

1. **Window resolution** — given an achievement's scope (season/all-time) and a tier's own lookback size, compute the actual `[start, end]` date range to evaluate against. This is shared, pure, and tested in isolation first, because getting it wrong silently corrupts every other layer.
2. **Context building** — one DB-querying function per family that fetches all the raw facts (attendance, signups, zones, classes) a family could ever need scored against, already clipped to the resolved window. This isolates all I/O in one place.
3. **Scoring** — nine small, pure functions (one per rule shape), each taking the pre-fetched context + a tier's `ruleConfig` and returning `{ crossed, progress }`. Pure functions mean exhaustive boundary-value testing without touching a database, mirroring the pattern Season 1's `badge-evaluator.ts` already uses (`evaluateAllBadges(context)` over a pre-fetched context object) — proven to work in this codebase, just generalized from a fixed badge list to a configurable rule shape.

The orchestrator (`evaluateAchievementsForFamily`) ties the three layers together per family: for every `achievement_tier` row, resolve its window, build (or reuse) the context, score it, and insert a new `achievement_award` row for any newly-crossed tier not already present — relying on Phase 1's `crossingUnique` index for idempotency rather than a manual existence check.

## Decisions Considered and Rejected

_Carried from the contract — filtered to phase-relevant entries._

- **Evaluation window granularity lives on the tier row (per-tier), not the achievement row** — rejected: One window per achievement, shared by all tiers. This is why `resolveEvaluationWindow` takes a per-tier lookback size, not a per-achievement one — bronze can be "60% over 4 weeks" while platinum is "100% over 10 weeks" on the same achievement.
- **Full 9-achievement catalog designed now (one per rule shape) rather than deferred** — rejected: Ship just one MVP achievement. All 9 shapes get a concrete definition in this phase's `achievement-definitions.ts`.
- **A rule engine covering 9 generalized shapes is core scope, not hardcoded per-achievement logic** — rejected: Hardcoded evaluation with no rule engine. The three-layer split above is exactly what makes shape-9 generality real rather than aspirational — a 10th achievement is a new `achievement-definitions.ts` entry, never a new `achievement-rules.ts` branch, as long as it reuses an existing shape.
- **Ambiguous or unmatched Raid Helper signup matches are excluded from Consistency/Flexibility evaluation, not counted** — rejected: Best-effort include ambiguous matches. The context builder filters to `matchStatus === "matched"` before it ever reaches the Consistency/Flexibility scorers.
- **Zone Attendance ships in MVP with one achievement per 40-man raid zone the guild clears this season (Onyxia and 20-man raids excluded)** — rejected: One current-zone achievement, rest deferred. `achievement-definitions.ts` defines one Zone Attendance achievement per zone below, all reusing the same `zone_attendance_threshold` shape.
- **Each shape's evaluator also returns a raw progress value, not just tier-crossing pass/fail** — carried from the success-criteria critic's fold-in, not a rejected alternative. Every scorer returns `{ crossed, progress: { current, target } }`, never just a boolean.

## Feedback Strategy

**Inner-loop command**: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts`

**Playground**: Vitest, pure-function-first. Window resolution and all nine scorers take plain data in and plain data out — no DB mocking needed for the bulk of this phase's tests. Only the context builder and orchestrator need the `vi.hoisted()` DB-mock pattern from `raid-signup-link-matching.test.ts`.

**Why this approach**: The scoring logic is where correctness risk concentrates (boundary values, window edges, exclusion rules), and pure functions make that testable in milliseconds without a database — the fastest possible loop for the highest-risk phase.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `apps/web/src/server/services/achievement-rules.ts` | Window resolution, context building, all nine scorers, and the orchestrator |
| `apps/web/src/server/services/achievement-definitions.ts` | The concrete achievement/tier data: 8 non-zone shapes + 1 all-time example + one Zone Attendance achievement per 40-man zone |
| `apps/web/src/server/services/__tests__/achievement-rules.test.ts` | Per-shape boundary tests, window resolution tests, idempotency, append-per-crossing, extensibility, progress |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/server/db/models/achievement-schema.ts` | Export `AchievementRuleConfig` as a proper discriminated union (Phase 1 stubbed it as a placeholder type for `.$type<>()`) |

_Referenced, not modified: `apps/web/src/server/api/helpers/match-signups.ts` (its `MatchStatus` type and `matchSignupsToCharacters` function), `apps/web/src/server/services/raid-signup-link-matching.ts` and `raid-helper-snapshot-queries.ts` (resolving a raid to its linked signup snapshot), `apps/web/src/lib/lockout-weeks.ts` (`getLockoutWeeks`)._

## Implementation Details

### Shared types + window resolution

**Overview**: The config union every tier's `ruleConfig` jsonb column stores one variant of, plus the pure function that turns "season-scoped, 4-lockout-week lookback, as of {date}" into a concrete `[start, end]` range.

```typescript
export type AchievementRuleConfig =
  | { shape: "attendance_threshold"; minPercent: number; lockoutWeeks: number }
  | { shape: "consistency_match"; minCount: number; lockoutWeeks: number }
  | { shape: "flexibility_match"; minCount: number; lockoutWeeks: number }
  | { shape: "bench_credit_count"; minCount: number; lockoutWeeks: number }
  | { shape: "zone_attendance_threshold"; zone: string; minCount: number; lockoutWeeks: number }
  | { shape: "raid_marathon_density"; minRaidsInOneWeek: number; lockoutWeeks: number }
  | { shape: "zone_breadth_window"; minDistinctZones: number; lockoutWeeks: number }
  | { shape: "class_breadth_window"; minDistinctClasses: number; lockoutWeeks?: number } // omitted when the achievement's scope is all_time
  | { shape: "family_double_up_cooccurrence"; minCount: number; lockoutWeeks: number };

export interface EvaluationResult {
  crossed: boolean;
  progress: { current: number; target: number };
}

export function resolveEvaluationWindow(
  achievementScope: "season" | "all_time",
  seasonStartDate: Date | null, // required when achievementScope === "season"
  lockoutWeeks: number | undefined, // shape-specific lookback; undefined = unbounded
  asOf: Date,
): { start: Date | null; end: Date } {
  const lockoutFloor = lockoutWeeks ? getLockoutWeeks(lockoutWeeks, true).at(0)?.start ?? null : null;
  if (achievementScope === "all_time") {
    return { start: lockoutFloor, end: asOf }; // null lockoutFloor = fully unbounded
  }
  // season-scoped: never look further back than the season's own start, even if the
  // tier's lockoutWeeks would otherwise reach earlier — this is what criterion 11 tests.
  const start = lockoutFloor && lockoutFloor > seasonStartDate! ? lockoutFloor : seasonStartDate;
  return { start, end: asOf };
}
```

**Key decisions**:

- `lockoutWeeks` lives per-shape-config, not per-achievement, so bronze/silver/gold/platinum tiers of the same achievement can each have their own window size (the "59%/4wk vs 100%/10wk" example from the contract).
- The season-scoped clip takes the *more restrictive* of the two bounds (`Math.max`-equivalent on dates) — a platinum tier asking for "10 lockout weeks" three weeks into a new season still only sees those three weeks, never bleeding into last season's data. This is the exact bug the interview flagged as the reason a real `season` entity exists at all.

**Feedback loop**:

- **Playground**: `achievement-rules.test.ts`, a `describe("resolveEvaluationWindow")` block, no mocks needed (pure function).
- **Experiment**: season-scoped with a lockback window larger than time-since-season-start (expect clip to season start); season-scoped with a lockback window smaller (expect the lockback floor); all-time with no lockoutWeeks (expect `start: null`).
- **Check command**: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t season-scoping`

### Context building

**Pattern to follow**: `apps/web/src/lib/badge-evaluator.ts`'s separation of "fetch once, score many times against a plain context object" — same idea, generalized.

**Overview**: One function per family that gathers every raw fact any of the nine shapes could need, already filtered to the widest window any of that family's tiers require (each shape's scorer then re-clips to its own tier's narrower window from this superset — cheaper than re-querying per tier).

```typescript
export interface RuleEvaluationContext {
  familyCharacterIds: number[]; // this family's characterId set (primary + secondaries)
  attendedRaids: Array<{ raidId: number; characterId: number; zone: string; class: string; lockoutWeekStart: Date; startTime: Date }>;
  matchedSignups: Array<{
    raidId: number;
    signedUpCharacterId: number; // resolved via matchSignupsToCharacters, matchStatus === "matched" only
    bucket: "confirmed" | "bench" | "tentative" | "absent";
    checkpointHoursBeforeStart: number;
  }>;
}

export async function buildRuleEvaluationContext(
  db: DB,
  primaryCharacterId: number,
  windowFloor: Date | null, // the widest (earliest) start across this family's tiers being evaluated
  asOf: Date,
): Promise<RuleEvaluationContext>;
```

**Key decisions**:

- `matchedSignups` only ever contains `matchStatus === "matched"` rows — the filter happens once, here, so every downstream scorer (Consistency, Flexibility, Bench Credit) automatically inherits the "exclude ambiguous/unmatched" rule without re-implementing it.
- Resolving a raid's linked signup snapshot goes: `raid → raidSignupSnapshotLinks (by raidId) → getLatestSignupSnapshotForOccurrence(raidHelperEventId, startTime) → matchSignupsToCharacters(db, snapshot.signups)`. A raid with no signup link (never got matched, or predates the linking feature) simply contributes no `matchedSignups` rows for that raid — Consistency/Flexibility can't award for it, which is correct (no signup data to compare against).
- `bucket` and `checkpointHoursBeforeStart` field names are carried from the contract's description of the signup snapshot shape (fixed checkpoints, confirmed/bench/tentative/absent buckets) — confirm exact field names against the real snapshot schema during implementation (see Open Items).

**Implementation steps**:

1. Query `raidLogAttendeeMap` joined to `raids`/`raidLogs` for `attendedRaids`, filtered to `family CharacterIds` and `[windowFloor, asOf]`.
2. For each distinct raid in that set (plus any raid the family signed up for but didn't necessarily attend, for Consistency's "signed up but check attendance" direction), resolve its signup link and run the match, filter to `matched`, populate `matchedSignups`.
3. Return the combined context.

**Feedback loop**:

- **Playground**: `achievement-rules.test.ts`, `vi.hoisted()` DB mocks per the `raid-signup-link-matching.test.ts` pattern.
- **Experiment**: a family with zero attended raids (empty context, no crash); a raid with no signup link at all; a raid whose signup link resolves but every individual signup is `ambiguous`/`unmatched` (expect zero `matchedSignups` for that raid).
- **Check command**: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t context`

### Scoring: Attendance Threshold (worked example)

**Overview**: The simplest shape — percentage of a family's own eligible raids attended within the window, compared against the tier's `minPercent`. Fully worked here; the remaining eight shapes follow the same `(context, config) => EvaluationResult` shape and are described in the table below rather than repeated in full.

```typescript
function scoreAttendanceThreshold(
  context: RuleEvaluationContext,
  config: Extract<AchievementRuleConfig, { shape: "attendance_threshold" }>,
  window: { start: Date | null; end: Date },
): EvaluationResult {
  const inWindow = context.attendedRaids.filter((r) => withinWindow(r.startTime, window));
  // "eligible raids" reuses whatever denominator the existing attendance % calculation
  // uses elsewhere in the app (see Open Items) — not re-derived here.
  const percent = computeAttendancePercent(inWindow, window);
  return { crossed: percent >= config.minPercent, progress: { current: percent, target: config.minPercent } };
}
```

**Key decisions**: reuses the app's existing attendance-percent denominator logic rather than re-deriving "eligible raid count" from scratch — two different definitions of "eligible" silently disagreeing would be a correctness bug users would immediately notice (their own attendance % showing one number on the dashboard and a different one driving achievements).

### Scoring: the remaining 8 shapes

Each follows `(context, config, window) => EvaluationResult`, same as above.

| Shape | Config fields used | Scoring logic |
| --- | --- | --- |
| `consistency_match` | `minCount` | Count raids where a `matchedSignups` row for a character exists with `checkpointHoursBeforeStart >= 96` (the "early checkpoint," see Open Items) and `bucket === "confirmed"`, AND that same `characterId` appears in `attendedRaids` for that raid. `crossed = count >= minCount`. |
| `flexibility_match` | `minCount` | Same shape as Consistency, but the matched-signup `characterId` and the attending `characterId` are *different* — cross-referenced only within `context.familyCharacterIds` (both from the same family). `crossed = count >= minCount`. |
| `bench_credit_count` | `minCount` | Count `matchedSignups` rows with `bucket === "bench"`. `crossed = count >= minCount`. |
| `zone_attendance_threshold` | `zone`, `minCount` | Count `attendedRaids` where `zone === config.zone`. `crossed = count >= minCount`. One achievement per zone reuses this same scorer with a different `config.zone`. |
| `raid_marathon_density` | `minRaidsInOneWeek` | Group `attendedRaids` by `lockoutWeekStart`; take the max distinct-raid count in any single week; `crossed = max >= minRaidsInOneWeek`. |
| `zone_breadth_window` | `minDistinctZones` | `new Set(attendedRaids.map(r => r.zone)).size`; `crossed = size >= minDistinctZones`. |
| `class_breadth_window` | `minDistinctClasses` | `new Set(attendedRaids.map(r => r.class)).size`; `crossed = size >= minDistinctClasses`. Same scorer serves both the season-bound achievement and the all-time example — only `window`/`achievement.scope` differ. |
| `family_double_up_cooccurrence` | `minCount` | Group `attendedRaids` by `raidId`; count raids where 2+ distinct `familyCharacterIds` appear; `crossed = count >= minCount`. |

For every row above, `progress.current` is the left-hand computed value (count/percent/size/max) and `progress.target` is the config's threshold field — the same shape as the worked Attendance example.

**Feedback loop** (covers the Attendance worked example above and all 8 shapes in the table — one shared test file, one check-command-per-shape pattern):

- **Playground**: `achievement-rules.test.ts`, one `describe` block per shape, no DB mocks needed (every scorer is pure — takes a pre-built `RuleEvaluationContext`, not a database).
- **Experiment**: for each shape, a fixture context with a value just below threshold (no crossing), exactly at threshold (crossing), and well above (crossing) — per the contract's boundary-value guidance, encode the actual numbers in the test title (e.g. `it("attendance: 59%@4wk=none, 60%@4wk=bronze, 100%@10wk=platinum")`).
- **Check command**: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t <shape-name>` (e.g. `-t attendance`, `-t zone-attendance`) — matches the exact tags the contract's success criteria already check against.

### Orchestrator + achievement-definitions.ts

**Overview**: Ties the layers together per family, handles idempotent insertion, and exposes the "current highest tier" query. `achievement-definitions.ts` is pure data — no logic — listing every concrete achievement + its tiers' `ruleConfig`.

```typescript
export async function evaluateAchievementsForFamily(
  db: DB,
  primaryCharacterId: number,
  asOf: Date,
): Promise<{ newAwards: Array<{ achievementTierId: string; primaryCharacterId: number }> }> {
  const tiers = await db.query.achievementTiers.findMany({ where: isNotNull(achievementTiers.ruleConfig), with: { achievement: true } });
  const widestFloor = /* min over resolveEvaluationWindow(...).start across all tiers, or null if any is unbounded */;
  const context = await buildRuleEvaluationContext(db, primaryCharacterId, widestFloor, asOf);

  const newAwards: Array<{ achievementTierId: string; primaryCharacterId: number }> = [];
  for (const tier of tiers) {
    const window = resolveEvaluationWindow(tier.achievement.scope, tier.achievement.season?.startDate ?? null, tier.ruleConfig!.lockoutWeeks, asOf);
    const result = scoreByShape(tier.ruleConfig!, context, window); // dispatches on ruleConfig.shape
    if (!result.crossed) continue;
    const inserted = await db
      .insert(achievementAwards)
      .values({ achievementTierId: tier.id, primaryCharacterId, source: "rule", awardedAt: asOf })
      .onConflictDoNothing({ target: [achievementAwards.achievementTierId, achievementAwards.primaryCharacterId] })
      .returning({ id: achievementAwards.id });
    if (inserted.length > 0) newAwards.push({ achievementTierId: tier.id, primaryCharacterId });
  }
  return { newAwards };
}

export async function getHighestTierPerAchievement(db: DB, primaryCharacterId: number): Promise<Map<string, "bronze" | "silver" | "gold" | "platinum">>;
// One query: join achievement_award -> achievement_tier, group by achievementId, take the max tier ordinal. Backs both goal 2's requirement and Phase 3's display.

export async function getNextTierProgress(db: DB, primaryCharacterId: number, achievementId: string, asOf: Date): Promise<{ nextTier: string; progress: { current: number; target: number } } | null>;
// Finds the lowest uncrossed tier for this achievement + family, evaluates only that tier's rule for its progress value, returns null if already at max tier or achievement has no rule (manual-only).
```

**Key decisions**:

- `onConflictDoNothing` targeting the exact `crossingUnique` index is the entire idempotency mechanism — no separate "already awarded?" existence check, so re-running evaluation twice against unchanged data is a guaranteed no-op by construction, not by careful bookkeeping.
- `getHighestTierPerAchievement` is a plain aggregate query, not a materialized/cached column — append-per-crossing means the answer is always derivable from the award rows themselves, so there's nothing to keep in sync.
- `achievement-definitions.ts` ships thresholds as a best-effort illustrative first pass (below) — these are explicitly expected to be tuned before or shortly after Season 2 launch once real lockout-week data exists to calibrate against.

**Feedback loop**:

- **Playground**: `achievement-rules.test.ts`, a `describe("evaluateAchievementsForFamily")` block using the `vi.hoisted()` DB-mock pattern (this is the one component in this phase that does touch the database).
- **Experiment**: run twice against unchanged fixture data (expect zero new rows the second time); a family crossing bronze then, with more fixture data added, silver on the same achievement (expect two rows, `getHighestTierPerAchievement` returns `"silver"`); add a second all-time `class_breadth_window` achievement to `achievement-definitions.ts` alone and confirm it evaluates with zero diff to `achievement-rules.ts`.
- **Check command**: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t idempotent`, `-t append-per-crossing`, `-t extensibility`

**Proposed `achievement-definitions.ts` contents** (illustrative — confirm/adjust at spec review):

| Achievement | Scope | Shape | Bronze | Silver | Gold | Platinum |
| --- | --- | --- | --- | --- | --- | --- |
| Raid Attendance | season | `attendance_threshold` | 60%/4wk | 75%/6wk | 90%/8wk | 100%/10wk |
| Consistency | season | `consistency_match` | 3/6wk | 6/8wk | 10/10wk | 15/12wk |
| Flexibility | season | `flexibility_match` | 2/6wk | 4/8wk | 7/10wk | 10/12wk |
| Bench Credit | season | `bench_credit_count` | 3/6wk | 6/8wk | 10/10wk | 15/12wk |
| Zone Attendance — Molten Core | season | `zone_attendance_threshold` | 3/4wk | 6/6wk | 10/8wk | 15/10wk |
| Zone Attendance — Blackwing Lair | season | `zone_attendance_threshold` | 3/4wk | 6/6wk | 10/8wk | 15/10wk |
| Zone Attendance — Temple of Ahn'Qiraj | season | `zone_attendance_threshold` | 3/4wk | 6/6wk | 10/8wk | 15/10wk |
| Zone Attendance — Naxxramas | season | `zone_attendance_threshold` | 3/4wk | 6/6wk | 10/8wk | 15/10wk |
| Raid Marathon | season | `raid_marathon_density` | 2 in 1wk | 3 in 1wk | 4 in 1wk | 5 in 1wk |
| Zone Breadth | season | `zone_breadth_window` | 2/6wk | 3/8wk | 4/10wk | 4/6wk (faster) |
| Class Breadth | season | `class_breadth_window` | 2/6wk | 3/8wk | 4/10wk | 5/12wk |
| Family Double-Up | season | `family_double_up_cooccurrence` | 1/6wk | 3/8wk | 6/10wk | 10/12wk |
| Class Breadth — All Classes, Ever | all_time | `class_breadth_window` | — | — | — | 9 classes, unbounded |

_The 4-zone list (Molten Core, Blackwing Lair, Temple of Ahn'Qiraj, Naxxramas) assumes the guild's current 40-man progression; confirm the exact zone set and names against what the guild is actually clearing this season before finalizing._

## Data Model

No schema changes beyond Phase 1's `ruleConfig` column now being populated with real data — see `achievement-definitions.ts`'s table above for the concrete rows this phase seeds via migration or a seed script.

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `apps/web/src/server/services/__tests__/achievement-rules.test.ts` | Window resolution boundaries; all 9 scorers' pass/fail boundary values; context builder's matched-signup filtering; idempotency; append-per-crossing; extensibility; progress values |

**Key test cases** (test titles should encode the boundary values per the contract's guidance, e.g. `it("attendance: 59%@4wk=none, 60%@4wk=bronze, 100%@10wk=platinum")`):

- Each of the 9 shapes: one value just below threshold (no crossing), one exactly at threshold (crossing), one well above (crossing, plus platinum-tier boundary).
- Consistency/Flexibility: a matched signup with no corresponding attendance (no crossing); an unmatched/ambiguous signup that would otherwise qualify (excluded, no crossing); same-character vs. cross-character-in-family disambiguation between the two shapes.
- Season-scoping: synthetic data before `season.startDate` does not count even when the tier's `lockoutWeeks` would otherwise reach it.
- All-time scoping: data from two seasons prior counts toward the all-time Class Breadth variant.
- Idempotent: running `evaluateAchievementsForFamily` twice against unchanged data produces zero new `achievement_award` rows the second time.
- Append-per-crossing: a family crossing bronze then (later, with more data) silver on the same achievement produces two rows; `getHighestTierPerAchievement` returns `"silver"`.
- Extensibility: adding a second all-time `class_breadth_window` achievement in `achievement-definitions.ts` alone evaluates correctly with zero changes to `achievement-rules.ts`.
- Progress: a family at 45% attendance against a 60% bronze threshold gets `{ current: 45, target: 60 }` back from `getNextTierProgress`, not just `crossed: false`.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Context builder | A raid has a signup link but the linked occurrence's snapshot was purged/never captured | `getLatestSignupSnapshotForOccurrence` returns `undefined` | That raid silently contributes zero `matchedSignups` | Acceptable by design — same as "no signup link at all"; Consistency/Flexibility simply can't credit that raid |
| Window resolution | `seasonStartDate` is null for a season-scoped tier (data integrity issue, not supposed to happen post-Phase-1 validation) | A malformed `achievement` row with `scope: "season"` and `seasonId: null` slipped past Phase 1's service-layer check | Window resolution throws or produces `NaN` dates | Treat as a hard error (throw), not a silent unbounded window — an unbounded season-scoped window is the exact pre-season instant-earn bug the real `season` entity exists to prevent |
| Orchestrator | Two evaluation triggers for the same family race (both QStash hook points from Phase 4 firing close together) | Concurrent `evaluateAchievementsForFamily` calls | Both attempt the same insert | `onConflictDoNothing` makes this safe by construction — one succeeds, one silently no-ops |
| Zone Attendance scorer | `config.zone` string doesn't exactly match the `zone` string recorded on `attendedRaids` (casing/naming drift) | A raid's zone field uses different capitalization/naming than the achievement definition | Achievement never crosses despite real attendance | Confirm the exact zone-string source of truth (see Open Items) and match `achievement-definitions.ts`'s zone values against it exactly, ideally via a shared enum/constant rather than free-text string matching on both sides |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts
pnpm --filter temple-era-web build
```

## Rollout Considerations

- **Feature flag**: none — this phase produces no user-visible surface (Phase 3 owns that); safe to land and seed data ahead of Phase 3/4 going live.
- **Monitoring**: once Phase 4 wires evaluation to real traffic, watch for `evaluateAchievementsForFamily` error rates and duration — this phase should log evaluation failures per family rather than letting one family's bad data (e.g., a malformed signup snapshot) abort a batch evaluation of others.
- **Rollback plan**: seed data (achievement-definitions.ts's inserts) can be deleted independently of the schema; the schema itself rolls back with Phase 1's migration if ever needed.

## Open Items

- [ ] Confirm the exact source of "eligible raid count" used by the app's existing attendance-percent calculation, so `computeAttendancePercent` reuses it rather than re-deriving a second definition.
- [ ] Confirm the exact field names/values for signup bucket classification (`confirmed`/`bench`/`tentative`/`absent`) and the "early checkpoint" hour threshold (96h assumed above) against the real signup snapshot schema.
- [ ] Confirm the real zone-string source of truth (whatever field `raidLogs`/`raids` stores zone in) so `achievement-definitions.ts`'s zone values match exactly, and confirm the actual 40-man zone list the guild is clearing this season (Molten Core/Blackwing Lair/Temple of Ahn'Qiraj/Naxxramas assumed above, Onyxia and 20-mans excluded per the contract).
- [ ] Confirm `characters` table exposes `class` in a form directly comparable across raids (the `raid-schema.ts` excerpt gathered this session showed `class`/`classDetail` columns; confirm which one Class Breadth should count distinct values of).
- [ ] All threshold numbers in `achievement-definitions.ts` are illustrative — review and adjust during spec approval or shortly after Season 2 launch once real data exists to calibrate against.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
