# Tradeskill Mastery Tiers Contract

**Created**: 2026-08-29
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

The 8 surviving profession-mastery achievements were built this session as one-tier custom achievements: eligibility was computed once by hand against the recipes/character_spells tables and grants were issued via one-off API calls. Nothing re-evaluates them — a character who later learns the missing recipe for their family's Thorium tier never gets granted automatically. There is also no partial-credit tier: a family with 5 of 6 tracked recipes shows exactly the same 'not yet earned' state as a family with zero.

Separately, the achievement display (shared by the character page's Achievements card and the standalone Achievements page) renders each section (Core, Classes, Legendary Feats) as a full-width `<h4>` label row stacked above an 8-column chip grid. As a family accumulates more tiered/hidden achievements, each section's chip grid wraps to more rows, but the section label still only occupies one line at the top — proportionally more of the page becomes chip grid with a comparatively bulky repeated header pattern (3 separate header rows) rather than a compact, scannable block. This is an independent UI cleanup, bundled into the same ideation session at the user's explicit request; it shares no code with Phase 1 and could ship or be dropped on its own.

## Goals

1. Convert all 8 tradeskill achievements from custom (ruleShape: null, exactly one tier) to a new `recipe_set_threshold` ruleShape, preserving their existing achievement IDs and existing Thorium-tier awards.
2. Add a Gold tier (ceil(N/2) of N tracked recipes known family-wide) to the 6 achievements with more than 2 tracked recipes: Flaskmaster (2 of 3: 17635/17636/17637), Fullmetal Zug (2 of 3: 16729/16741/27829), Glow Up (3 of 6: 20034/20025/23802/25079/22750/22749), Sew Cold (2 of 4: 28208/28205/28207/28209), Sew Natural (2 of 4: 28481/28482/28480/28210), Chill Patchwork (3 of 6: 28224/28222/28223/28221/28220/28219). Onyxia Cloakweaver and Best-o Resto (2 tracked recipes each) stay single-tier (Thorium only, 2 of 2). Current baseline Thorium holder counts (informational, not a frozen check value): Chill Patchwork 6, Sew Cold 10, Flaskmaster 14, Fullmetal Zug 3, Glow Up 4, Sew Natural 13, Onyxia Cloakweaver 4, Best-o Resto 2.
3. Wire `addRecipeToCharacter` (src/server/api/routers/recipe.ts) to resolve the mutated character's primary/family id (extend its existing character lookup to select `primaryCharacterId`, coalesce to `characterId` — following the pattern already used in this same router's `getAllRecipesWithCharacters`) and synchronously run a new shape-scoped evaluation limited to `recipe_set_threshold` tiers after the write succeeds, so tier awards stay current automatically without paying for a full attendance/signup-history context rebuild on every recipe toggle. `removeRecipeFromCharacter` is explicitly NOT wired: the award engine only ever inserts new awards and never revokes one, so a recipe removal can never newly cross a threshold — re-evaluating after a removal is a guaranteed no-op (independently flagged by two plan-critic lenses).
4. Write a one-time, dev-runnable backfill script (an ad hoc `.ts` script run via `doppler run -- npx tsx`, this session's established pattern for one-off DB operations — not `seedAchievementDefinitions`, which is insert-only and incompatible with converting existing rows in place) that: (a) captures the current Thorium-tier award counts for all 8 achievements as its own pre-migration snapshot, (b) sets each achievement's ruleShape + tier ruleConfig via direct UPDATE statements against the existing 8 rows, and (c) runs an initial family-wide evaluation pass to grant any newly-qualifying Gold awards. The 8 achievements are matched by their fixed achievement ID (listed in the Technical Approach / decision log), never by name — the 8 were renamed mid-session (Flaskmaster, Fullmetal Zug, Glow Up, Sew Cold, Sew Natural, Chill Patchwork, Best-o Resto; Onyxia Cloakweaver unchanged), and ID matching means this backfill script and both DB success-criteria queries are unaffected by that or any future rename.
5. A real Postgres migration adding `recipe_set_threshold` to the `achievement_rule_shape` enum (generated via `pnpm --filter temple-era-web db:generate`, applied to dev via `db:migrate`/`db:push`) — required before the backfill script or the recipe hook can write that value; this enum has been extended the same way twice before (see `apps/web/drizzle/0041_fresh_rumiko_fujikawa.sql`).
6. Each of the 6 graduated achievements' `description` becomes a substitution template resolved per-tier by the existing `resolveAchievementDescription` (src/server/services/achievement-description.ts) against that tier's own `ruleConfig.minCount` — the same mechanism already used for the 8 class-attendance achievements — so a Gold award and a Thorium award of the same achievement render different, accurate counts from one stored template. This is the only viable way to get tier-differentiated text: `achievement.description` is a single column on the achievement, not one per tier (see achievement-schema.ts:70), so two hardcoded description strings per achievement is not an option under the current schema. Exact templates (backfill script writes these into each achievement's `description` column; resolved text shown for both tiers): Flaskmaster — "Knows {minCount} of the 3 tracked Flask recipes: Flask of the Titans, Flask of Distilled Wisdom, and Flask of Supreme Power." -> Gold "Knows 2 of the 3 tracked Flask recipes: Flask of the Titans, Flask of Distilled Wisdom, and Flask of Supreme Power.", Thorium "Knows 3 of the 3 tracked Flask recipes: Flask of the Titans, Flask of Distilled Wisdom, and Flask of Supreme Power." | Fullmetal Zug — "Forges {minCount} of the 3 tracked plate recipes: Lionheart Helm, Titanic Leggings, and Stronghold Gauntlets." -> Gold "Forges 2 of 3...", Thorium "Forges 3 of 3..." (same item list). | Glow Up — "Knows {minCount} of the 6 tracked enchants: Crusader, Greater Stats (Chest), Healing Power (Bracer, Gloves, Weapon), and Spellpower (Weapon)." -> Gold "Knows 3 of the 6...", Thorium "Knows 6 of the 6..." (same item list). | Sew Cold — "Sews {minCount} of the 4 pieces of the Glacial set: Cloak, Gloves, Vest, and Wrists." -> Gold "Sews 2 of the 4...", Thorium "Sews 4 of the 4...". | Sew Natural — "Sews {minCount} of the 4 tracked nature-resist pieces: the Sylvan Crown, Shoulders, and Vest, plus Gaea's Embrace." -> Gold "Sews 2 of the 4...", Thorium "Sews 4 of the 4...". | Chill Patchwork — "Crafts {minCount} of the 6 tracked frost-resist pieces: the Icy Scale set (Bracers, Breastplate, Gauntlets) and the Polar set (Bracers, Gloves, Tunic)." -> Gold "Crafts 3 of the 6...", Thorium "Crafts 6 of the 6...". The 2 non-graduated achievements keep their existing static description unchanged (no template, single tier, unaffected by this goal): Best-o Resto — "Crafts Corehound Belt and Hide of the Wild."; Onyxia Cloakweaver — "Crafts both Cindercloth Cloak and Onyxia Scale Cloak, spanning Tailoring and Leatherworking."
7. Replace each section's full-width `<h4>` header row in `achievement-display.tsx` with a vertically rotated label positioned to the left of that section's chip grid, separated by a light divider, sized to the full height of the (possibly wrapped, multi-row) grid — on both the character page's Achievements card and the standalone Achievements page.
8. Add a 'Tradeskill' tab to achievement-admin-panel.tsx's existing tab bar (All / Core / Classes / Legendary Feats), filtering by `ruleShape === 'recipe_set_threshold'` — the exact same pattern the existing 'Classes' tab already uses for `ruleShape === 'class_attendance_threshold'` — so the 8 converted achievements are easy to find and manage separately from the generic hidden bucket.

## Success Criteria

- [ ] The codebase type-checks cleanly with the new ruleShape, migration, and hook wiring in place — check: `pnpm --filter temple-era-web typecheck` → exits 0
- [ ] Lint passes on all changed files — check: `pnpm --filter temple-era-web lint` → exits 0
- [ ] The full web test suite passes, including new unit tests for the recipe_set_threshold evaluator shape and the recipe-mutation hook — check: `pnpm --filter temple-era-web test` → exits 0
- [ ] After the drizzle migration and the dev-DB backfill script run, all 8 achievements report ruleShape = recipe_set_threshold, the 6 graduated ones have exactly 2 tiers (gold+thorium), and Onyxia Cloakweaver / Best-o Resto have exactly 1 (thorium) — verified with a self-asserting query, not a query whose exit code is blind to its own result — check: `doppler run --config dev -- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF EXISTS (SELECT 1 FROM achievement a JOIN achievement_tier t ON t.achievement_id=a.id WHERE a.id::text IN ('06d68bcf-e3a9-4e6b-9d62-bdc4bdc599be','d418a4cb-3f83-46e5-a657-b2b86774d6ec','497f1d1e-9747-4edb-a909-e52591c4b57b','0164a7f1-321c-4fbd-86be-03de62e6128c','cdb3bc09-e47c-4d0f-b2ab-e1b8b21edfd1','365d3c49-2808-4303-aa0b-45ebe8f632b0','2a3dae46-664e-40a9-8eae-f153b26d9801','a7dc6aec-9053-48c7-9a4c-b55dacc26397') GROUP BY a.id, a.rule_shape HAVING a.rule_shape IS DISTINCT FROM 'recipe_set_threshold' OR count(DISTINCT t.id) <> CASE WHEN a.id::text IN ('2a3dae46-664e-40a9-8eae-f153b26d9801','a7dc6aec-9053-48c7-9a4c-b55dacc26397') THEN 1 ELSE 2 END) THEN RAISE EXCEPTION 'tier/ruleShape mismatch'; END IF; END \$\$;"` → exits 0 (a real mismatch raises an exception and exits non-zero)
- [ ] No existing Thorium-tier holder is lost by the migration, verified against the pre-migration snapshot the backfill script itself captures at its start (goal 4a) rather than literals frozen in this criterion, since award counts can change between contract approval and execution — judgment call: developer diffs the backfill script's captured pre-migration snapshot against post-migration Thorium-tier award counts per achievement and confirms none decreased
- [ ] Seeding a family one recipe short of an achievement's Gold threshold, then calling the real `addRecipeToCharacter` with the missing recipe, results in a real Gold-tier `achievement_award` row for that family (not merely a mocked-call assertion that the evaluator was invoked) — check: `pnpm --filter temple-era-web test -- recipe.test` → exits 0, including an integration-style case that seeds real data, calls addRecipeToCharacter, and queries for the resulting Gold award row
- [ ] The compacted section-header layout renders correctly on both the character page's Achievements card and the standalone Achievements page, at both narrow and wide viewport widths, without breaking existing chip interactions (tooltips, replay-on-click) — judgment call: developer visually reviews /achievements (signed in and signed out) and a character detail page's Achievements card in a browser at mobile and desktop widths
- [ ] The new 'Tradeskill' admin tab shows exactly the 8 converted achievements (and no others) and filters the same way the existing 'Classes' tab does — judgment call: developer opens the achievement admin panel, clicks the Tradeskill tab, and confirms it lists Flaskmaster, Fullmetal Zug, Glow Up, Sew Cold, Sew Natural, Chill Patchwork, Best-o Resto, and Onyxia Cloakweaver with no extras

## Scope Boundaries

### In Scope

- New `recipe_set_threshold` AchievementRuleConfig shape (type + achievement-rules.ts evaluator case) plus the drizzle migration adding it to the achievement_rule_shape enum — The core mechanism every other MVP item depends on; the enum is a real Postgres type and needs a real migration, not just a TS change (confirmed by the hidden-dependency critic against the same enum's two prior extensions).
- Convert all 8 tradeskill achievements to the new ruleShape in place, preserving IDs and existing awards, via a direct-UPDATE backfill script (not seedAchievementDefinitions, which is insert-only) — Avoids re-triggering the reveal overlay for current holders and avoids re-notification churn; seedAchievementDefinitions' insert-only design is incompatible with in-place conversion.
- Add a Gold tier (ceil(N/2) of N) to the 6 achievements with more than 2 tracked recipes — The explicit ask: 2 levels, Gold + Thorium, for the achievements where a partial tier is meaningful.
- Backfill script captures its own pre-migration Thorium-award-count snapshot, then sets ruleShape/tiers and runs an initial family-wide evaluation pass — Populates the new Gold tier for already-qualifying families and gives the migration a real, non-stale baseline to verify against.
- Synchronous, shape-scoped hook in addRecipeToCharacter only, resolving the mutated character's family id first — The explicit ask: fire achievement calcs from a new hook. Scoped to addRecipeToCharacter and to recipe_set_threshold tiers only, per two converging critic findings that (a) the removal path can never newly cross a threshold and (b) the full evaluator otherwise pays for an unrelated attendance-context rebuild on every recipe toggle.
- Compact display: rotated left-rail section label with divider, spanning wrapped row height, replacing the full-width header row — The explicit ask, scoped to character/achievement pages only. Independent of Phase 1 — bundled at the user's request, not a shared dependency.
- New 'Tradeskill' tab in achievement-admin-panel.tsx, filtering by ruleShape === 'recipe_set_threshold' — Requested mid-review; trivial given the existing 'Classes' tab already filters by ruleShape the same way — no new pattern, just a new filter value and tab label.

### Out of Scope

- Admin panel achievement catalog layout beyond the new Tradeskill tab (e.g. no compact/rotated-label redesign of achievement-admin-panel.tsx — that treatment is character/achievement-page only) — The Tradeskill tab was added mid-review as a scoped, low-risk filter addition; the broader display-compaction work (Phase 2) still only targets the pages the user named.
- Generalizing recipe_set_threshold to any achievement beyond these 8 — No other profession achievement exists yet; premature abstraction without a second real user.
- Async/QStash-based evaluation trigger for recipe edits — Explicitly rejected this session — recipe edits are low-volume, single-character, admin-only, unlike the raid-log ingestion volume that motivated the existing async pattern.
- removeRecipeFromCharacter hook wiring — Guaranteed no-op: the award engine only ever inserts, never revokes, and a recipe removal can only shrink a family's known-recipe count, so it can never newly cross a threshold. Flagged independently by the scope-creep and over-engineering critic lenses.
- A recipe-progress UI (e.g. '3/6 known' indicator on unearned chips) — Not requested; the existing earned/unearned chip binary display is unchanged in shape.
- Running the backfill/migration script against production — One-way data mutation against real user-facing award state — deferred to a deliberate manual step after code review, not part of automated spec execution.
- Re-touching Fire Blacksmith / Master Axesmith / Fire Leatherworker — Already deleted earlier this session; unrelated to this project.

### Future Considerations

- If additional profession achievements are added later, recipe_set_threshold generalizes to them directly with no engine changes.
- A progress indicator (X of Y known recipes) on unearned tradeskill achievement chips, if the binary earned/unearned display ever feels insufficient.
- If a future feature needs award revocation (e.g. an admin 'undo grant' action), a removeRecipeFromCharacter-side re-evaluation would need real design then, not today.

## Decisions Considered and Rejected

- **Onyxia Cloakweaver and Best-o Resto (2 tracked recipes each) stay single-tier, Thorium only.** — rejected: Uniform 2-tier (Gold+Thorium) treatment for all 8 achievements, with Gold meaning 'knows 1 of 2'.. A 1-of-2 threshold is a trivially low, not-really-a-milestone bar for Gold — the user agreed keeping these two single-tier is cleaner than a meaningless partial credit.
- **Gold tier = a uniform ceil(N/2)-of-N fraction of each achievement's full tracked recipe list.** — rejected: A curated, per-achievement natural sub-grouping for Gold (e.g. Chill Patchwork Gold = one full set of the two; Sew Natural Gold = the Sylvan set without Gaea's Embrace).. The user chose the simpler, generically-computable rule over bespoke per-achievement curation, despite the natural-sub-grouping option being recommended as thematically stronger.
- **Convert the 8 existing achievement rows in place (same IDs), keeping current awards as the Thorium-tier grants, then run one evaluation pass to backfill Gold.** — rejected: Delete all 8 and their awards, recreate fresh, re-evaluate everyone from zero.. In-place conversion avoids re-triggering the reveal overlay / re-notifying every current holder for an achievement they already legitimately earned.
- **The recipe-mutation hook calls a new shape-scoped evaluation (recipe_set_threshold tiers only), synchronously, inline, before the mutation resolves — wired into addRecipeToCharacter only.** — rejected: Async fire-and-forget via a new QStash-published, family-keyed variant of the existing raid-based publishAchievementEvaluate pattern; also rejected: wiring the same call into removeRecipeFromCharacter, and reusing the full evaluateAchievementsForFamily (all ruleShapes) unscoped.. Recipe edits are low-volume, single-character, admin-only actions — the async infra that raid-log ingestion needs doesn't apply. The removal hook was dropped because the award engine never revokes (guaranteed no-op, confirmed by the scope-creep and over-engineering critics). The full evaluator was rejected because it rebuilds an entire attendance/signup-history context — unrelated to tradeskills — on every recipe checkbox toggle (over-engineering critic).
- **recipe_set_threshold's evaluator does its own direct DB query (family character IDs + character_spells) inside scoreByShape, rather than extending the shared RuleEvaluationContext.** — rejected: Threading recipe-knowledge data through the shared RuleEvaluationContext used by every attendance-based shape.. RuleEvaluationContext is entirely raid/attendance-shaped; scoreByShape's `db` and `primaryCharacterId` parameters were already deliberately threaded through (currently voided/unused) specifically to let a future shape needing real I/O add its own query without a signature change — see the comment at achievement-rules.ts's scoreByShape definition.
- **The backfill script is written as a direct-UPDATE ad hoc `.ts` script run via `doppler run -- npx tsx`, matching this session's established pattern for one-off DB operations, rather than extending or calling `seedAchievementDefinitions`.** — rejected: Reusing seedAchievementDefinitions for the conversion.. seedAchievementDefinitions is documented as insert-only ('always inserts fresh rows'), is never invoked anywhere in the codebase outside its own mocked test, and there's no established permanent script-running mechanism in this repo for app-TS-importing scripts — the ad hoc scratch-script pattern is the real precedent (hidden-dependency critic).
- **Both DB-verification success criteria are self-asserting queries (RAISE EXCEPTION on mismatch) wrapped in `doppler run --config dev --`, and the Thorium-holder-count check diffs against a snapshot the backfill script captures itself rather than literals frozen in the criterion text.** — rejected: Plain `psql -c "SELECT ..."` checks with the expected result only described in prose, and hardcoded baseline counts in the criterion.. The success-criteria critic confirmed the original checks pass regardless of the query's actual result (a real mismatch would still exit 0), and that literal baseline counts go stale the moment any Thorium award is granted between contract approval and execution — since this is a live, actively-granted system.
- **Every script and success-criteria query in this plan matches the 8 achievements by their fixed UUID (Flaskmaster 06d68bcf-e3a9-4e6b-9d62-bdc4bdc599be, Fullmetal Zug d418a4cb-3f83-46e5-a657-b2b86774d6ec, Glow Up 497f1d1e-9747-4edb-a909-e52591c4b57b, Sew Cold 0164a7f1-321c-4fbd-86be-03de62e6128c, Sew Natural cdb3bc09-e47c-4d0f-b2ab-e1b8b21edfd1, Chill Patchwork 365d3c49-2808-4303-aa0b-45ebe8f632b0, Onyxia Cloakweaver 2a3dae46-664e-40a9-8eae-f153b26d9801, Best-o Resto a7dc6aec-9053-48c7-9a4c-b55dacc26397), never by their current display name.** — rejected: Matching by achievement name (as originally drafted, e.g. `WHERE a.name IN ('Master Alchemist', ...)` — the achievement's name at the time this decision was made).. The user renamed all 8 achievements mid-session (to Flaskmaster, Fullmetal Zug, Glow Up, Sew Cold, Sew Natural, Chill Patchwork, Best-o Resto; Onyxia Cloakweaver unchanged) and could rename them again later. A name-matched migration or verification query would silently match fewer rows the moment a rename lands before or after execution; ID matching, decided before any rename actually happened, is immune to that — and the renames that followed confirmed the call was right.
- **Add a 'Tradeskill' tab to achievement-admin-panel.tsx, reusing the existing ruleShape-filter pattern the 'Classes' tab already established.** — rejected: Leaving the admin panel untouched (the original draft's stance) and letting the 8 converted achievements sit undifferentiated inside the generic Legendary Feats / hidden bucket.. Requested mid-review. The addition is low-risk because it copies an existing, working pattern verbatim (filter by ruleShape) rather than inventing new admin UI structure.

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Tradeskill Mastery Rule Engine
  └── Compact Achievement Display  (blocked by Tradeskill Mastery Rule Engine)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs\ideation\tradeskill-mastery-tiers\contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Tradeskill Mastery Tiers contract (tradeskill-mastery-tiers) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs\ideation\tradeskill-mastery-tiers\contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs\ideation\tradeskill-mastery-tiers\contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=2/2 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Parallel — the two phases touch disjoint files and neither blocks the other.

1. **Phase 1** — Tradeskill Mastery Rule Engine _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/tradeskill-mastery-tiers/spec-phase-1.md
   ```

2. **Phase 2** — Compact Achievement Display

   ```bash
   /ideation:execute-spec docs/ideation/tradeskill-mastery-tiers/spec-phase-2.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
