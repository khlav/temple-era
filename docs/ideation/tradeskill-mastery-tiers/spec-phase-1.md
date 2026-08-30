# Implementation Spec: Tradeskill Mastery Tiers - Phase 1

**Contract**: ./contract.md
**Estimated Effort**: M

## Technical Approach

Convert the 8 existing tradeskill achievements (Flaskmaster, Fullmetal Zug, Glow Up, Sew Cold, Sew Natural, Chill Patchwork, Best-o Resto, Onyxia Cloakweaver) from one-tier custom (manual-grant) achievements into genuine rule-based achievements evaluated by a new `recipe_set_threshold` shape, then wire real-time evaluation into the one code path that changes the data this shape depends on: `addRecipeToCharacter`.

Three things make this narrower than it first looks:

1. **The evaluator extension point already exists.** `scoreByShape` in `achievement-rules.ts` is declared `async` and already threads `db`/`primaryCharacterId` through — currently unused (`void db; void primaryCharacterId;`) — specifically so a future shape needing real I/O doesn't need a signature change (see the comment at its definition). `recipe_set_threshold` is that shape: it queries `character_spells` directly instead of going through the shared `RuleEvaluationContext` (which is entirely raid/attendance-shaped and has nothing to do with recipes).
2. **The 8 achievements don't need `achievement-definitions.ts` entries.** That file is the code-defined catalog `seedAchievementDefinitions()` populates (insert-only, one-time/reseed-from-scratch — see its own doc comment). These 8 already exist as real DB rows with real awards; converting them means UPDATE-ing those rows in place (new `ruleShape`, new/changed `ruleConfig` on their tiers), not inserting fresh ones through the code catalog. The evaluator doesn't care where a tier's `ruleConfig` came from — it reads whatever is in the DB.
3. **The hook only needs to go one direction.** The achievement-award engine only ever `INSERT`s (see `evaluateAchievementsForFamilies`'s `alreadyAwardedKeys` short-circuit and its `onConflictDoNothing` insert — there is no revoke path in the rule engine). Removing a recipe can only shrink a family's known-recipe count for this shape, so it can never newly cross a threshold. Only `addRecipeToCharacter` gets the hook.

The write path is: a real drizzle migration adds `recipe_set_threshold` to the `achievement_rule_shape` Postgres enum → a committed backfill script (kept for a later, separate, manually-triggered prod run — not deleted after use, unlike this session's throwaway `_*.ts` scratch scripts) does direct `UPDATE`s converting the 8 rows and runs one evaluation pass → `addRecipeToCharacter` gets a two-line addition (resolve family, call the new shape-scoped evaluator) → the admin panel gets a new tab reusing its existing `ruleShape`-filter pattern.

## Decisions Considered and Rejected

_Carried from the contract._

- **Onyxia Cloakweaver and Best-o Resto stay single-tier, Thorium only** — rejected: uniform 2-tier treatment for all 8, with Gold meaning "knows 1 of 2." A 1-of-2 threshold is a trivially low, not-really-a-milestone bar for Gold.
- **Gold tier = a uniform ceil(N/2)-of-N fraction of each achievement's full tracked recipe list** — rejected: a curated, per-achievement natural sub-grouping (e.g. Chill Patchwork Gold = one full set of the two). The user chose the simpler, generically-computable rule over bespoke curation.
- **Convert the 8 existing achievement rows in place (same IDs), keeping current awards as Thorium-tier grants** — rejected: delete all 8 and recreate fresh. In-place conversion avoids re-triggering the reveal overlay / re-notifying current holders.
- **The recipe-mutation hook calls a new shape-scoped evaluation (`recipe_set_threshold` tiers only), synchronously, wired into `addRecipeToCharacter` only** — rejected: async QStash-published trigger (recipe edits are low-volume/admin-only, unlike raid-log ingestion); wiring the same call into `removeRecipeFromCharacter` (guaranteed no-op — the engine never revokes); reusing the full `evaluateAchievementsForFamily` unscoped (rebuilds an entire attendance/signup-history context unrelated to tradeskills on every recipe toggle).
- **`recipe_set_threshold`'s evaluator does its own direct DB query inside `scoreByShape`, rather than extending `RuleEvaluationContext`** — rejected: threading recipe-knowledge data through the shared context. `RuleEvaluationContext` is entirely raid/attendance-shaped; `scoreByShape`'s unused `db`/`primaryCharacterId` params exist for exactly this kind of extension.
- **The backfill script is a direct-UPDATE `.ts` script**, run via `doppler run -- npx tsx` — rejected: reusing/extending `seedAchievementDefinitions` (insert-only, incompatible with in-place conversion; also never invoked anywhere outside its own mocked test).
- **Both DB-verification success criteria are self-asserting queries** (`RAISE EXCEPTION` on mismatch) wrapped in `doppler run --config dev --`, diffing against a snapshot the backfill script captures itself — rejected: plain `SELECT` checks whose exit code is blind to the result, and literal baseline counts that go stale the moment any award is granted between contract approval and execution.
- **Every script/query matches the 8 achievements by fixed UUID, never by name** — rejected: name-based matching (the achievements were renamed mid-session and could be renamed again; ID matching is immune to that).
- **Add a 'Tradeskill' tab to `achievement-admin-panel.tsx`**, reusing the existing `ruleShape`-filter pattern the 'Classes' tab already uses — rejected: leaving the admin panel untouched. Requested mid-review; low-risk because it copies a working pattern verbatim.

## Feedback Strategy

**Inner-loop command**: `pnpm --filter temple-era-web test -- achievement-rules`

**Playground**: Vitest (existing `achievement-rules.test.ts` and a new `recipe.test.ts` case), plus direct `psql` queries against the dev DB for the migration/backfill verification.

**Why this approach**: The evaluator logic (`scoreRecipeSetThreshold`, the new orchestrator) is pure data-in/data-out against a mocked or real `db` — the existing test file's mocking pattern already covers this shape of test. The migration and backfill are one-shot DB operations best verified by direct SQL, matching how every other DB-touching change in this session was checked.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `apps/web/drizzle/<generated>_add_recipe_set_threshold.sql` | Generated by `pnpm --filter temple-era-web db:generate` — adds `recipe_set_threshold` to the `achievement_rule_shape` Postgres enum. Do not hand-write; let drizzle-kit generate it from the schema change below so it stays in sync with drizzle's snapshot journal. |
| `apps/web/scripts/backfill-tradeskill-tiers.ts` | One-time-per-environment backfill: captures a pre-migration Thorium-award-count snapshot, UPDATEs the 8 achievement/tier rows to the new shape, runs one evaluation pass. Committed (not deleted after the dev run) because it needs a second, separate, manually-triggered run against production later. |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/server/db/models/achievement-schema.ts` | Add `"recipe_set_threshold"` to `achievementRuleShapeEnum`; add `AchievementRuleConfigRecipeSetThreshold` interface; add it to the `AchievementRuleConfig` union. |
| `apps/web/src/server/services/achievement-rules.ts` | Add `scoreRecipeSetThreshold` (direct DB query, no `RuleEvaluationContext`); branch `scoreByShape` to call it for this shape instead of `scoreByShapeSync`; add `evaluateRecipeAchievementsForFamily`, a shape-scoped sibling of `evaluateAchievementsForFamilies` that only fetches `recipe_set_threshold` tiers and skips the attendance-context build entirely. |
| `apps/web/src/server/api/routers/recipe.ts` | `addRecipeToCharacter`: after the insert succeeds, resolve `characterExists.primaryCharacterId ?? characterExists.characterId` (the character row is already fetched in full — no query shape change needed) and call `evaluateRecipeAchievementsForFamily`. |
| `apps/web/src/components/achievements/achievement-admin-panel.tsx` | Add a `TabsTrigger value="tradeskill"` alongside the existing All/Core/Classes/Legendary Feats tabs, filtering the catalog by `ruleShape === "recipe_set_threshold"` — same pattern as the existing Classes tab's `ruleShape === "class_attendance_threshold"` filter. |
| `apps/web/src/server/services/__tests__/achievement-rules.test.ts` | New tests for `scoreRecipeSetThreshold` and `evaluateRecipeAchievementsForFamily`. |
| `apps/web/src/server/api/routers/__tests__/recipe.test.ts` | New test(s) for the `addRecipeToCharacter` hook wiring (see Testing Requirements). Create this file if it doesn't already exist, following the mocking pattern of an existing router test (e.g. `apps/web/src/app/api/v1/raids/__tests__/route.test.ts` for the DB-mock shape, adapted to a tRPC router test). |

## Implementation Details

### 1. Schema: new rule shape

**Pattern to follow**: `AchievementRuleConfigClassAttendanceThreshold` (`achievement-schema.ts`) — same discriminated-union-member shape, same "add to enum + add interface + add to union" mechanics as the enum's last two extensions (see `apps/web/drizzle/0041_fresh_rumiko_fujikawa.sql`).

**Overview**: One new enum value, one new config interface with a fixed recipe list and a threshold count.

```typescript
export const achievementRuleShapeEnum = pgEnum("achievement_rule_shape", [
  // ...existing values...
  "recipe_set_threshold",
]);

/** A family (any character sharing the same resolved primaryCharacterId) knows at least
 *  `minCount` of the recipes in `recipeSpellIds`. Evaluated by direct DB query in
 *  scoreByShape, not via the shared RuleEvaluationContext — recipe knowledge has nothing to
 *  do with raid attendance. No lockoutWeeks: recipe knowledge doesn't expire. */
export interface AchievementRuleConfigRecipeSetThreshold {
  shape: "recipe_set_threshold";
  recipeSpellIds: number[];
  minCount: number;
}

export type AchievementRuleConfig =
  | AchievementRuleConfigConsistencyMatch
  | AchievementRuleConfigFlexibilityMatch
  | AchievementRuleConfigBenchCreditCount
  | AchievementRuleConfigZoneAttendanceThreshold
  | AchievementRuleConfigRaidMarathonDensity
  | AchievementRuleConfigZoneBreadthWindow
  | AchievementRuleConfigClassBreadthWindow
  | AchievementRuleConfigFamilyDoubleUpCooccurrence
  | AchievementRuleConfigWeightedAttendanceThreshold
  | AchievementRuleConfigClassAttendanceThreshold
  | AchievementRuleConfigRecipeSetThreshold;
```

**Key decisions**:

- No `lockoutWeeks` field — recipe knowledge is permanent, unlike attendance windows.
- `recipeSpellIds` is stored per-tier (Gold and Thorium tiers of the same achievement both carry the full list; only `minCount` differs) so `scoreRecipeSetThreshold` never needs to know which achievement it's scoring — it just counts intersection against whatever list its own tier's config carries.

**Implementation steps**:

1. Add the enum value and the two type changes above.
2. Run `pnpm --filter temple-era-web db:generate` (from `apps/web`, under `doppler run` if env validation requires it — see AGENTS.md) to produce the migration file. Do not edit the generated SQL by hand.
3. Apply it to dev: `pnpm --filter temple-era-web db:migrate` (or `db:push` if that's the project's dev-apply convention — check `package.json` scripts first).

### 2. Evaluator: `scoreRecipeSetThreshold` + `scoreByShape` branch

**Pattern to follow**: `apps/web/src/server/api/routers/recipe.ts`'s `getAllRecipesWithCharacters` (the `c.primaryCharacterId ?? c.characterId` family-resolution one-liner) for family resolution; the existing `characters`/`characterRecipeMap` imports already used elsewhere in this file's neighbors.

**Overview**: A pure-ish async function that resolves the scored primary character's family (primary + secondaries), counts how many of `config.recipeSpellIds` any family member knows, and compares to `config.minCount`.

```typescript
import { characterRecipeMap } from "~/server/db/schema"; // add to existing achievement-rules.ts imports

async function scoreRecipeSetThreshold(
  db: DB,
  primaryCharacterId: number,
  config: Extract<AchievementRuleConfig, { shape: "recipe_set_threshold" }>,
): Promise<EvaluationResult> {
  const familyCharacters = await db
    .select({ characterId: characters.characterId })
    .from(characters)
    .where(
      or(
        eq(characters.characterId, primaryCharacterId),
        eq(characters.primaryCharacterId, primaryCharacterId),
      ),
    );
  const familyCharacterIds = familyCharacters.map((c) => c.characterId);
  if (familyCharacterIds.length === 0) {
    return { crossed: false, progress: { current: 0, target: config.minCount } };
  }

  const known = await db
    .selectDistinct({ recipeSpellId: characterRecipeMap.recipeSpellId })
    .from(characterRecipeMap)
    .where(
      and(
        inArray(characterRecipeMap.characterId, familyCharacterIds),
        inArray(characterRecipeMap.recipeSpellId, config.recipeSpellIds),
      ),
    );

  const current = known.length;
  return { crossed: current >= config.minCount, progress: { current, target: config.minCount } };
}
```

Branch `scoreByShape` (the existing async dispatch point) to call this instead of `scoreByShapeSync` for this one shape:

```typescript
export async function scoreByShape(
  db: DB,
  primaryCharacterId: number,
  context: RuleEvaluationContext,
  config: AchievementRuleConfig,
  window: EvaluationWindow,
): Promise<EvaluationResult> {
  if (config.shape === "recipe_set_threshold") {
    return scoreRecipeSetThreshold(db, primaryCharacterId, config);
  }
  void db;
  void primaryCharacterId;
  return scoreByShapeSync(context, config, window);
}
```

`scoreByShapeSync`'s switch is exhaustive over `AchievementRuleConfig` — since `scoreByShape` now narrows `recipe_set_threshold` away before calling it, add a defensive case there too so the switch stays exhaustive and any accidental future call with this shape fails loudly rather than falling through:

```typescript
case "recipe_set_threshold":
  throw new Error("recipe_set_threshold is handled by scoreByShape, not scoreByShapeSync");
```

**Key decisions**:

- `or`/`and`/`inArray`/`eq` are already imported from `drizzle-orm` elsewhere in this file's neighbors (`recipe.ts`) — confirm the exact import list at the top of `achievement-rules.ts` and extend it (it currently imports `and, eq, gte, inArray, lte` — add `or`).
- `selectDistinct` avoids double-counting if the same recipe were somehow mapped twice within one family (shouldn't happen given `characterRecipeMap`'s composite PK, but a family spans multiple characters so the same `recipeSpellId` can legitimately appear once per character that knows it).

**Feedback loop**:

- **Playground**: `achievement-rules.test.ts`'s existing mocked-`db` pattern (see any existing `describe` block scoring a shape).
- **Experiment**: family knows 0, `minCount - 1`, and `minCount` of the tracked recipes; a secondary character (not the primary) holding the missing recipe still counts; a recipe outside `recipeSpellIds` is ignored even if known.
- **Check command**: `pnpm --filter temple-era-web test -- achievement-rules`

### 3. Shape-scoped orchestrator: `evaluateRecipeAchievementsForFamily`

**Pattern to follow**: `evaluateAchievementsForFamilies` (same file, immediately above `evaluateAchievementsForFamily`) — reuse its award-insertion block (the `alreadyAwardedKeys` pre-check + `onConflictDoNothing` insert) verbatim; the only structural difference is the `tiers` fetch is filtered to this one shape and there is no `contexts`/`buildRuleEvaluationContextsForFamilies` step at all.

**Overview**: The hook-facing entry point. Evaluates only `recipe_set_threshold` tiers for one family, with none of the attendance-context cost `evaluateAchievementsForFamily` would otherwise pay.

```typescript
export async function evaluateRecipeAchievementsForFamily(
  db: DB,
  primaryCharacterId: number,
  asOf: Date,
): Promise<FamilyEvaluationResult> {
  const tiers = await db.query.achievementTiers.findMany({
    where: (tier, { isNotNull }) => isNotNull(tier.ruleConfig),
    with: { achievement: true },
  });
  const recipeTiers = tiers.filter(
    (t) => t.achievement.ruleShape === "recipe_set_threshold",
  );
  if (recipeTiers.length === 0) return { newAwards: [] };

  const existingAwardRows = await db.query.achievementAwards.findMany({
    where: eq(achievementAwards.primaryCharacterId, primaryCharacterId),
    columns: { achievementTierId: true },
  });
  const alreadyAwardedTierIds = new Set(existingAwardRows.map((a) => a.achievementTierId));

  try {
    const newAwards: NewAward[] = [];
    for (const tier of recipeTiers) {
      if (alreadyAwardedTierIds.has(tier.id)) continue;
      const config = tier.ruleConfig as Extract<
        AchievementRuleConfig,
        { shape: "recipe_set_threshold" }
      >;
      const result = await scoreRecipeSetThreshold(db, primaryCharacterId, config);
      if (!result.crossed) continue;

      const inserted = await db
        .insert(achievementAwards)
        .values({
          achievementTierId: tier.id,
          primaryCharacterId,
          source: "rule",
          awardedAt: asOf,
        })
        .onConflictDoNothing({
          target: [achievementAwards.achievementTierId, achievementAwards.primaryCharacterId],
        })
        .returning({ id: achievementAwards.id });

      if (inserted.length > 0) newAwards.push({ achievementTierId: tier.id, primaryCharacterId });
    }
    return { newAwards };
  } catch (error) {
    return { error };
  }
}
```

**Key decisions**:

- Filters `achievement.ruleShape === "recipe_set_threshold"` in memory after the query rather than pushing it into the `where` clause — the tiers table is small (well under a hundred rows today) and this mirrors how the existing orchestrator already filters (`isNotNull(tier.ruleConfig)`) without over-optimizing a query that isn't hot.
- Returns the same `FamilyEvaluationResult` shape as the general-purpose orchestrator so callers (and tests) can treat both uniformly.

**Feedback loop**:

- **Playground**: same mocked-`db` test file.
- **Experiment**: a family already holding Gold gains Thorium when the missing recipe is added; a family with zero recipe-shaped tiers awarded gets nothing (not even a wasted query beyond the initial fetch); an already-awarded tier is never re-inserted.
- **Check command**: `pnpm --filter temple-era-web test -- achievement-rules`

### 4. Hook: `addRecipeToCharacter`

**Pattern to follow**: `apps/web/src/server/api/routers/recipe.ts`'s own `getAllRecipesWithCharacters` for the `primaryCharacterId ?? characterId` resolution idiom.

**Overview**: After the existing insert succeeds, fire the shape-scoped evaluation for the mutated character's family. `characterExists` (already fetched earlier in this mutation for the existence check) is an unfiltered `findFirst` result and already carries `primaryCharacterId` — no query change needed to obtain it.

```typescript
// after: const result = await ctx.db.insert(characterRecipeMap).values({...}).returning();

const familyPrimaryId = characterExists.primaryCharacterId ?? characterExists.characterId;
await evaluateRecipeAchievementsForFamily(ctx.db, familyPrimaryId, new Date());

return {
  success: true,
  message: "Recipe added to character successfully",
  data: result[0],
};
```

Also handle the early-return case (`existingMapping` already present, before the insert): recipe was already known, so nothing newly crossed — do not call the evaluator there, it would only repeat work with no possible new award.

**Key decisions**:

- No try/catch around the evaluator call: if it throws, the mutation should surface that rather than silently swallow a real bug (matches how the rest of this mutation has no defensive error handling around its own DB calls).
- Placed after `.returning()`, not before — the achievement award should only be considered for a recipe mapping that actually persisted.

**Feedback loop**:

- **Playground**: a new `recipe.test.ts` router test with a mocked `ctx.db`.
- **Experiment**: seed a family one recipe short of Gold, call the real mutation with the missing recipe, assert a Gold award row would be inserted (via the mocked/real evaluator call) — not just that the evaluator function was invoked.
- **Check command**: `pnpm --filter temple-era-web test -- recipe.test`

### 5. Admin panel: Tradeskill tab

**Pattern to follow**: the existing `classes` tab filter in `achievement-admin-panel.tsx` (filters by `ruleShape === "class_attendance_threshold"`) — copy its structure exactly for `ruleShape === "recipe_set_threshold"`.

**Overview**: One new `TabsTrigger` and its corresponding filtered list, alongside `all`/`core`/`classes`/`secret`.

**Implementation steps**:

1. Add `<TabsTrigger value="tradeskill">Tradeskill</TabsTrigger>` to the `TabsList` (after Classes, before Legendary Feats — matches the display order the 8 achievements would otherwise not have anywhere dedicated).
2. Add the corresponding filtered `CatalogGroup`/tab-content block, filtering the full catalog to `ruleShape === "recipe_set_threshold"`, following whatever component the `classes` tab content already uses.

**Feedback loop**: Omit — this is a small, mechanical copy of an existing, working pattern; verified visually per the contract's judgment criterion, not worth a dedicated test.

### 6. Backfill script

**Pattern to follow**: this session's established ad hoc `doppler run -- npx tsx` scripts (e.g. the class-feat rename, the Guild Armorist creation script) for the execution mechanics; `achievement-service.ts`'s direct `db.update(achievements)...` style for the UPDATE statements themselves.

> **Mid-build correction** (see `implementation-notes-phase-1.html`): the existing single tier on all 8 achievements is `arcanite`, not `thorium` as originally assumed. Resolved with the user: demote the existing tier row's `tier` value to `thorium` (same `achievement_tier.id` — existing awards/awardedAt/source untouched, only the enum value changes) and add a new `gold` tier below it for the 6 graduated achievements. The snapshot step below must count by the achievement's *existing* tier id (whatever it's currently labeled), not by filtering `tier = 'thorium'` — before the UPDATE runs, no row is labeled `thorium` yet.

**Overview**: `apps/web/scripts/backfill-tradeskill-tiers.ts`. Idempotent-safe to re-run (every step either checks current state first or is a plain UPDATE/UPSERT that converges to the same end state), since it will run once against dev now and once against production later.

```typescript
import { db } from "~/server/db";
import { achievements, achievementTiers } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { evaluateRecipeAchievementsForFamily } from "~/server/services/achievement-rules";

// id -> { thoriumRecipeIds, goldMinCount | null (null = stays single-tier) }
const ACHIEVEMENTS: Record<string, { recipeSpellIds: number[]; goldMinCount: number | null }> = {
  "06d68bcf-e3a9-4e6b-9d62-bdc4bdc599be": { recipeSpellIds: [17635, 17636, 17637], goldMinCount: 2 }, // Flaskmaster
  "d418a4cb-3f83-46e5-a657-b2b86774d6ec": { recipeSpellIds: [16729, 16741, 27829], goldMinCount: 2 }, // Fullmetal Zug
  "497f1d1e-9747-4edb-a909-e52591c4b57b": { recipeSpellIds: [20034, 20025, 23802, 25079, 22750, 22749], goldMinCount: 3 }, // Glow Up
  "0164a7f1-321c-4fbd-86be-03de62e6128c": { recipeSpellIds: [28208, 28205, 28207, 28209], goldMinCount: 2 }, // Sew Cold
  "cdb3bc09-e47c-4d0f-b2ab-e1b8b21edfd1": { recipeSpellIds: [28481, 28482, 28480, 28210], goldMinCount: 2 }, // Sew Natural
  "365d3c49-2808-4303-aa0b-45ebe8f632b0": { recipeSpellIds: [28224, 28222, 28223, 28221, 28220, 28219], goldMinCount: 3 }, // Chill Patchwork
  "2a3dae46-664e-40a9-8eae-f153b26d9801": { recipeSpellIds: [/* Onyxia + Cindercloth recipeSpellIds */], goldMinCount: null }, // Onyxia Cloakweaver
  "a7dc6aec-9053-48c7-9a4c-b55dacc26397": { recipeSpellIds: [/* Corehound Belt + Hide of the Wild recipeSpellIds */], goldMinCount: null }, // Best-o Resto
};

// Description templates from the contract's Goal 6 — set alongside ruleShape (see step 2).
const DESCRIPTIONS: Record<string, string> = {
  "06d68bcf-e3a9-4e6b-9d62-bdc4bdc599be":
    "Knows {minCount} of the 3 tracked Flask recipes: Flask of the Titans, Flask of Distilled Wisdom, and Flask of Supreme Power.",
  // ...one per graduated achievement, verbatim from the contract...
};

async function main() {
  // 1. Snapshot: current Thorium-tier award counts per achievement, for the post-migration diff.
  //    Print this — it's the baseline the success-criteria judgment check compares against.
  for (const achievementId of Object.keys(ACHIEVEMENTS)) {
    const thoriumTier = await db.query.achievementTiers.findFirst({
      where: (t, { and, eq }) => and(eq(t.achievementId, achievementId), eq(t.tier, "thorium")),
    });
    // ...count achievementAwards where achievementTierId = thoriumTier.id, log it...
  }

  // 2. Convert each achievement + its tier(s).
  for (const [achievementId, { recipeSpellIds, goldMinCount }] of Object.entries(ACHIEVEMENTS)) {
    await db
      .update(achievements)
      .set({ ruleShape: "recipe_set_threshold", description: DESCRIPTIONS[achievementId] ?? undefined })
      .where(eq(achievements.id, achievementId));

    // Existing single tier becomes Thorium's ruleConfig (full set).
    await db
      .update(achievementTiers)
      .set({ ruleConfig: { shape: "recipe_set_threshold", recipeSpellIds, minCount: recipeSpellIds.length } })
      .where(eq(achievementTiers.achievementId, achievementId)); // and tier = 'thorium' if multiple tiers ever exist by this point

    if (goldMinCount !== null) {
      await db.insert(achievementTiers).values({
        achievementId,
        tier: "gold",
        ruleConfig: { shape: "recipe_set_threshold", recipeSpellIds, minCount: goldMinCount },
      });
    }
  }

  // 3. Evaluation pass: grant any newly-qualifying Gold awards.
  //    Every primaryCharacterId with at least one character in character_spells is a candidate —
  //    query distinct family roots from `character`, call evaluateRecipeAchievementsForFamily per family.

  // 4. Print post-migration Thorium counts alongside step 1's snapshot for the diff.
}

main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
```

**Key decisions**:

- The exact `recipeSpellIds` for Onyxia Cloakweaver and Best-o Resto are left as a fill-in above — this session already resolved them during live grants but the specific IDs weren't captured in the contract (only the 6 graduated achievements' IDs were, since those are the ones with a Gold threshold to compute). Look them up the same way the 6 others were resolved: `SELECT recipe_spell_id, recipe FROM recipes WHERE recipe IN (...)` against the item names in each achievement's current description, before writing this script's literals.
- `goldMinCount: null` achievements get no second `insert` — their single existing tier is UPDATEd to `ruleShape`'s config with `minCount` equal to the full set size, same as every other achievement's Thorium tier.
- The description UPDATE folds into the same statement as the `ruleShape` UPDATE (both are `achievements` table columns) rather than a separate pass.

**Feedback loop**:

- **Playground**: run directly against dev via `doppler run -- npx tsx apps/web/scripts/backfill-tradeskill-tiers.ts`.
- **Experiment**: run once, verify via the two DB success-criteria queries below; run a second time, verify it's a no-op (idempotent) — no duplicate Gold tiers inserted, no changed Thorium award counts.
- **Check command**: the two `psql` commands in Success Criteria.

## Data Model

### Schema Changes

```sql
-- Generated by drizzle-kit db:generate — do not hand-write.
ALTER TYPE "public"."achievement_rule_shape" ADD VALUE 'recipe_set_threshold';
```

No new tables. `achievement_tier.rule_config` (existing `jsonb` column) gains a new shape of value; `achievement.rule_shape` (existing enum column) gains a new value; `achievement.description` (existing `varchar(512)`) gets updated content on the 6 graduated rows (well within the 512-char limit for these templates).

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `apps/web/src/server/services/__tests__/achievement-rules.test.ts` | `scoreRecipeSetThreshold`: 0/partial/full known-recipe counts, secondary-character contribution, recipes outside the tracked list ignored. `evaluateRecipeAchievementsForFamily`: grants Gold then Thorium as recipes accumulate, skips already-awarded tiers, ignores non-recipe-shaped tiers entirely, returns `{ newAwards: [] }` when nothing crosses. |
| `apps/web/src/server/api/routers/__tests__/recipe.test.ts` | `addRecipeToCharacter` calls the evaluator with the resolved family id (secondary character resolves to its primary); the already-mapped early-return path does NOT call the evaluator; an integration-style case seeding a family one recipe short of Gold results in a real Gold `achievement_award` row after the real mutation runs. |

**Key test cases**:

- A secondary character (not the family's primary) knowing the missing recipe still crosses the family's threshold.
- A family that already holds Gold and Thorium gets no duplicate award when re-evaluated.
- `removeRecipeFromCharacter` is asserted to NOT call any evaluator (regression guard for the explicitly-rejected hook).

### Manual Testing

- [ ] Run the backfill script against dev; confirm both DB success-criteria queries pass.
- [ ] In the app, add the missing recipe to a family sitting at Gold for one of the 6 graduated achievements; confirm the reveal overlay fires for the new Thorium tier.
- [ ] Open the achievement admin panel's new Tradeskill tab; confirm exactly the 8 achievements appear.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `scoreRecipeSetThreshold` | Family resolves to zero characters | A `primaryCharacterId` that doesn't correspond to any real character row (shouldn't happen given the hook's own resolution, but defends the function as a standalone unit) | Would throw or miscount without a guard | Explicit early return `{ crossed: false, progress: { current: 0, target: config.minCount } }` when `familyCharacterIds.length === 0` |
| `evaluateRecipeAchievementsForFamily` | Race: two recipe adds for the same family land concurrently | Two characters in one family get recipes added in quick succession | Both evaluations could try to insert the same new award | Same mitigation as the existing orchestrator: `onConflictDoNothing` on the award insert makes the second one a no-op |
| Backfill script | Re-run after a partial failure | Script errors mid-loop (e.g. network blip) | Some achievements converted, others not; a second run must not double-insert Gold tiers | Gold-tier insert should check for an existing Gold tier on that achievement first (or use `onConflictDoNothing` if there's a suitable unique constraint) — verify which is available before finalizing this step |
| `addRecipeToCharacter` hook | Evaluator throws | A bug in the new evaluator code, or a DB hiccup | The whole mutation fails, recipe is not saved (transaction semantics depend on whether the insert + evaluator call happen in one transaction — check current mutation's transaction handling) | Acceptable per this spec's "no try/catch" decision — surfacing the failure is preferable to silently losing an achievement grant. Revisit only if this proves too strict in practice. |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
pnpm --filter temple-era-web test
```

## Rollout Considerations

- **Feature flag**: none — this is additive (new tab, new shape) and doesn't change existing achievement behavior for anyone until the backfill runs.
- **Monitoring**: none beyond the existing app-wide error tracking; this is a low-traffic admin/hook path.
- **Rollback plan**: the migration only *adds* an enum value (no `DROP VALUE` support in Postgres without recreating the type, matching the existing `attendance_threshold` precedent) — a rollback would revert the 8 achievements' `rule_shape` back to `null` and remove the inserted Gold tiers via a follow-up script, not a schema rollback.

## Open Items

- [ ] Resolve the exact `recipeSpellIds` for Onyxia Cloakweaver and Best-o Resto before writing the backfill script's literals (see Implementation Details §6).
- [ ] Confirm whether `addRecipeToCharacter`'s insert + evaluator call should be wrapped in a single DB transaction, or whether the current mutation has no transaction wrapper at all (matches existing behavior either way — just confirm which, for the Failure Modes note above).
- [ ] Confirm the dev-DB apply command (`db:migrate` vs `db:push`) against `package.json`'s actual script names before running it.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
