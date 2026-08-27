# Achievement Engine Contract

**Created**: 2026-08-26
**Readiness**: All 5 gates ready
**Status**: Approved
**Approval**: Interactive review
**Supersedes**: None

## Problem Statement

Temple Era guild raiders have no permanent record of what they've accomplished in a season. Season 1's badge system is evaluated entirely client-side, on every render, against a rolling 6-week attendance window — a badge a raider held last month can silently vanish this month as the window rolls forward, even though they genuinely earned it. There is no fanfare, no persistent trophy case, and no way for an officer to manually recognize something that can't be reduced to a rule (Season 1's recipe data is self-reported and can be temporarily faked, so it can never be trusted for automated verification).

Season 2 needs achievements that are permanent once earned, evaluated by rule against actual data scoped correctly to a season's own lockout weeks (never bleeding in pre-season history) or, for a smaller set of exceptionally hard achievements, across all history — with room for officers to manually grant recognition outside the rule engine entirely.

## Goals

1. Every tier crossing (bronze through platinum) that a rule is satisfied for during its correct window — season-clipped or all-time — is captured exactly once as a permanent achievement_award row, keyed to the family that earned it, with no duplicates and no missed crossings.
2. A family that goes bronze then later silver on the same achievement ends up with two permanent, individually-replayable award rows, while still being trivially queryable for 'current highest tier' per achievement per season.
3. A raider with unseen awards sees a badged FAB on the dashboard; clicking it plays the already-validated reveal ceremony (hero + strip for multiple awards) against real data, every image preloaded before the sequence starts.
4. Dismissing the reveal marks seenAt for every shown award; a new Trophy Case surface lets a raider replay any past reveal on demand, independent of seen state.
5. Season 1's ephemeral badge system is fully retired — code removed, its old achievement/rule definitions preserved only as documentation — replaced entirely by the new permanent model.
6. The rule engine supports all 9 identified rule shapes, plus the season-bound/all-time scope dimension, as pure configuration — a new achievement requires no new engineering, only new data.
7. Visible achievements show, on both the character page and the Trophy Case, the highest tier a family has earned plus a progress bar toward the next tier; hidden achievements occupy no display space at all until the family earns their first tier of one, after which earned hidden achievements surface in a dedicated 'Hidden Achievements Earned' section — never revealing an unearned hidden achievement's existence.

## Success Criteria

- [ ] Achievement schema (season, achievement, achievement_tier, achievement_award) typechecks and Drizzle relations compile. — check: `pnpm --filter temple-era-web typecheck` → exits 0
- [ ] Raid Attendance (threshold-over-window) awards the correct tier at each boundary against synthetic lockout-week data (e.g. 59%/4wk = none, 60%/4wk = bronze, 100%/10wk = platinum). — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t attendance` → exits 0
- [ ] Consistency (same-character signup↔attend match) requires BOTH an early-checkpoint confirmed signup AND matching actual attendance by that same character; a synthetic case with only one half does not award. An ambiguous or unmatched signup-to-character match (match-signups.ts's MatchStatus) is excluded, not counted. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t consistency` → exits 0
- [ ] Flexibility (cross-character family signup↔attend match) awards when the signed-up and attending characters differ but share a family, and does not award when the attending character isn't linked to the signed-up one. An ambiguous or unmatched signup match is excluded, not counted. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t flexibility` → exits 0
- [ ] Bench Credit (discrete event count) increments only on bench-classified signup buckets against synthetic multi-raid signup history. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t bench-credit` → exits 0
- [ ] Zone Attendance (per-zone threshold) evaluates each 40-man raid zone independently — attendance in one zone doesn't count toward another zone's tier. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t zone-attendance` → exits 0
- [ ] Raid Marathon (per-week raid density) counts distinct raids attended within a single lockout week, not raw attendance count across weeks. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t raid-marathon` → exits 0
- [ ] Zone Breadth (per-window zone breadth) counts distinct zones raided within a window; attending the same zone twice does not double-count. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t zone-breadth` → exits 0
- [ ] Class Breadth (per-window class breadth) counts distinct classes the family raided as within a season window. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t class-breadth` → exits 0
- [ ] Family Double-Up (per-raid family co-occurrence) awards when two characters from the same family both appear in one raid's attendee set. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t family-double-up` → exits 0
- [ ] An all-time-scoped achievement (reusing the Class Breadth rule, unbounded window) counts qualifying data from a season two seasons prior — all-time scope is NOT clipped to the current season. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t all-time` → exits 0
- [ ] A season-bound achievement's window clips to [season.startDate, now] — synthetic qualifying data from before the season start does not count toward it. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t season-scoping` → exits 0
- [ ] Evaluation is idempotent — running the same evaluation twice against unchanged data produces zero duplicate achievement_award rows. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t idempotent` → exits 0
- [ ] Crossing bronze then later silver on the same achievement within one season produces two permanent rows, not one overwritten row, and 'current highest tier' is trivially queryable from them. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t append-per-crossing` → exits 0
- [ ] A new achievement definition that reuses an existing rule shape (e.g. a second all-time Class Breadth variant) can be added in achievement-definitions.ts alone, with zero diff to achievement-rules.ts, and evaluates correctly — proving goal 6's 'no new engineering, only new data' claim. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t extensibility` → exits 0
- [ ] Each rule shape's evaluator exposes a raw progress value (current metric, next tier's threshold) alongside tier-crossing pass/fail, computed from the same window/scope logic — not a second parallel implementation. — check: `pnpm --filter temple-era-web vitest run src/server/services/__tests__/achievement-rules.test.ts -t progress` → exits 0
- [ ] A visible achievement always renders on the character page and the Trophy Case with its highest earned tier (or 'not yet earned') and a progress bar toward the next tier; a hidden achievement renders nowhere until the family earns its first tier of it, after which it appears only inside a Hidden Achievements Earned section on both surfaces. — judgment call: reviewer seeds one visible achievement mid-progress and one hidden achievement (unearned, then earned) and checks both surfaces reflect the correct display state
- [ ] Creating a custom award definition (name, icon, tier, season|all-time scope, no rule attached) and granting it are two separate achievement:manage-scoped mutations — an unscoped session is rejected from both, and the same definition can be granted to multiple different families over time, each grant producing its own achievement_award row. — check: `pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts -t manual-grant` → exits 0
- [ ] A dedicated mark-seen mutation sets seenAt on every achievement_award row passed to it, scoped to the calling user's own family, and is idempotent if called twice. — check: `pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts -t mark-seen` → exits 0
- [ ] The QStash evaluation route rejects an unsigned request and, given a valid signed request, evaluates only the triggering raid's attendees against a synthetic roster. — check: `pnpm --filter temple-era-web vitest run src/app/api/qstash/achievement-evaluate/__tests__/route.test.ts` → exits 0
- [ ] Season 1's badge-definitions.ts, badge-evaluator.ts, and character-badges.tsx are deleted, and their content is preserved in a written archive doc. — check: `test ! -f apps/web/src/lib/badge-definitions.ts && test ! -f apps/web/src/lib/badge-evaluator.ts && test -f docs/followups/season-1-badges-archive.md` → exits 0
- [ ] The reveal overlay plays end-to-end against real data: the FAB's badge count matches unseen rows, clicking preloads every icon before the sequence starts, and the Trophy Case's replay button re-fires a past reveal on demand. — judgment call: reviewer clicks through FAB → reveal → dismiss → Trophy Case replay in a real browser against seeded achievement_award data
- [ ] Wired-to-real-data reveal choreography (timing, layering, per-tier effect ladder) matches the validated docs/followups/mockups/reveal-overlay.html mockup with no regressions from the ladder documented in reveal-overlay-notes.md, for bronze through platinum only — the diamond path is not ported at MVP. — judgment call: reviewer compares the live reveal side-by-side against the mockup for at least one bronze-tier and one platinum-tier crossing

## Scope Boundaries

### In Scope

- season table (id, name, startDate, endDate nullable) with every rule window resolving against it — prevents the exact pre-season instant-earn bug flagged in the interview
- achievement + achievement_tier + achievement_award schema — family-level attribution (primaryCharacterId, not characterId), append-per-crossing (one permanent row per tier crossed, never overwritten), season|all-time scope flag, hidden boolean flag (whole achievement, not per-tier) — the unified permanent data model replacing the old ephemeral badge / hand-awarded trophy split; hidden mirrors Season 1's hidden-badge concept
- achievement:manage scope + two-step manual admin flow: (1) create a custom award definition (name, icon, tier, season|all-time scope, hidden flag) with no rule attached, (2) grant that definition to any family, repeatable over time for sequential recipients (1st, 2nd, Nth) — each grant its own achievement_award row — officers need to define ad-hoc recognition (not just seed-script edits) and grant recipe-sourced or one-off awards that can never be rule-verified
- Character page + Trophy Case achievement display: highest tier earned + progress bar toward the next tier for visible achievements; hidden achievements are invisible until first earned, then shown in a dedicated Hidden Achievements Earned section on both surfaces — the two real surfaces raiders check their standing on; user specified this display behavior directly
- Rule engine supporting all 9 identified rule shapes and the season/all-time scope dimension: one fully-specified achievement per shape for the 8 non-zone shapes, plus 1 reusing Class Breadth's logic at all-time scope (10 total there), and Zone Attendance defined once per 40-man raid zone the guild clears this season (Onyxia and 20-man raids excluded) rather than a single zone — proves the engine generalizes; more achievements become pure data afterward — Zone Attendance's full zone list is itself just more data rows, no new engineering
- QStash route: re-evaluate the triggering raid's attendees' achievements right after mutateInsertRaidLogWithAttendees succeeds — reuses the existing discovery/capture QStash pattern, fires precisely when new data could cross a threshold
- Season 1 badge system removed; badge-definitions.ts/badge-evaluator.ts/character-badges.tsx content archived to a doc first — explicit rip-and-replace decision — no dual-running old and new systems
- Dashboard FAB badged with unseen-award count, mounted globally alongside the existing GlobalQuickLauncher pattern in layout.tsx — reveal only fires on deliberate click, never automatically — decided during the earlier mockup-design phase
- Reveal overlay wired to real achievement_award data — preload every icon before the sequence starts, mark seenAt on dismiss, hero+strip layout for >1 unseen award — the already-validated mockup choreography, made real
- Trophy Case surface with a per-award replay button — decided during the earlier mockup-design phase — replay independent of seen/unseen state

### Out of Scope

- Recipe-based rule evaluation — recipe data is self-reported and unverifiable; recipes are manual-grant only, confirmed in interview
- Signup-timing-precision achievements (exact minutes-early) — the unused entryTime field would need new instrumentation; deferred per interview
- Recipe-fulfillment tracking ('crafted for a guildmate') — no request/transaction model exists today; a real new feature, deferred per interview
- Trophy icon next to every character name render site — explicitly stretch/polish in the original plan doc (old Phase 5), gates nothing here
- Editing or retuning rule-based achievement definitions (thresholds, windows) through an admin UI — user confirmed all rule-based achievements are permanently code-based (achievement-definitions.ts); the admin UI's only job is the MVP two-step manual-grant flow for custom, non-rule awards

### Future Considerations

- More achievements of any of the 9 shapes, or new shapes entirely
- Precise signup-timing achievements, once entryTime is wired up
- Recipe-fulfillment tracking and 'crafted for guildmates' achievements
- Diamond tier's use case is undecided — the reveal mockup's ceremony art/code (runDiamondBuildup, fireSupernova, DIAMOND_CADENCE) already exists and stays unported reference until one is defined

## Decisions Considered and Rejected

- **Rip out and replace Season 1's badge system entirely, archiving old definitions/rules to documentation only** — rejected: Coexist alongside the new permanent achievement system. user explicitly said 'no need to preserve anything more than documentation' — avoids maintaining two parallel recognition systems
- **Recipes are manual-grant only, no rule engine involvement** — rejected: Rule-evaluate recipe knowledge like the other datasets. recipe data is self-reported and can be temporarily faked, unsuitable for automated verification
- **Evaluation window granularity lives on the tier row (per-tier), not the achievement row** — rejected: One window per achievement, shared by all tiers. user said window design 'will depend on the achievements we define' — per-tier is a strict superset that doesn't foreclose future flexibility
- **QStash message published after mutateInsertRaidLogWithAttendees succeeds, scoped to that raid's attendees** — rejected: Periodic full-roster nightly QStash schedule. fires precisely when new data could cause a crossing, reuses the existing discovery/capture pattern, avoids up-to-a-day lag
- **Real season entity with start/end dates; achievements re-earnable per season** — rejected: Hardcode Season 2's start date as a constant. cheap now, avoids a painful migration when Season 3 launches
- **Full 9-achievement catalog designed now (one per rule shape) rather than deferred** — rejected: Ship just one MVP achievement and treat the rest as a follow-up task. user chose 'full catalog now' once the shape-based framing made the scope tractable
- **Attribution is family-level (primaryCharacterId) — matches how attendance already aggregates across a character's alts** — rejected: Character-level attribution (one award row per specific character). a same-day orphaned contract (docs/ideation/season-2-awards/contract.md) had already independently reached family-level attribution for the same feature; user confirmed it over character-level once surfaced
- **Permanence is append-per-crossing — a new row for every tier crossed, never overwritten** — rejected: Ratchet — one row per season updated in place to the highest tier reached. matches the mockup's per-crossing reveal ceremony and lets each crossing be individually replayed; 'current highest tier' stays trivially queryable per the interview's explicit note
- **A rule engine covering 9 generalized shapes is core scope, not hardcoded per-achievement logic** — rejected: Hardcoded evaluation with no rule engine (the orphaned contract's out-of-scope call). this session's interview drove toward an explicit, reusable rule-shape taxonomy across attendance, signups, and family structure — superseding the earlier, less-informed exclusion
- **Diamond tier is NOT reserved exclusively for all-time achievements; all-time achievements can use the full bronze→platinum ladder like season-bound ones** — rejected: Diamond = all-time-only capstone tier, reviving the orphaned contract's + mockup's existing diamond tier design. user declined — all-time achievements aren't necessarily single-tier; diamond's eventual use case is left undecided
- **Phase 3 ports only the bronze→platinum reveal choreography; the mockup's diamond buildup/supernova path stays unported reference until a concrete diamond achievement exists** — rejected: Port the full ladder including diamond now, since the mockup already built it. over-engineering critic finding — no achievement uses diamond, scope.future already calls its use case undecided, and criterion 20 was already judgment-scoped to bronze/platinum only; porting an unused, untested animation path was pure risk with no consumer
- **Achievement evaluation fires from two hook points — after mutateInsertRaidLogWithAttendees succeeds, AND again after runPostRaidCreationSignupLinking resolves in POST /api/v1/raids** — rejected: A single hook on mutateInsertRaidLogWithAttendees only. hidden-dependency critic finding — Consistency/Flexibility depend on raidSignupSnapshotLinks, which is created later by a separate, unrelated request; evaluation is already idempotent (criterion 13) so firing twice is safe and simpler than guaranteeing one exact ordering
- **Ambiguous or unmatched Raid Helper signup matches (match-signups.ts's MatchStatus) are excluded from Consistency/Flexibility evaluation, not counted** — rejected: Best-effort include ambiguous matches. hidden-dependency critic flagged this as previously unspecified; excluding is the conservative default that avoids awarding on an uncertain identity match
- **Zone Attendance ships in MVP with one achievement per 40-man raid zone the guild clears this season (Onyxia and 20-man raids excluded), not a single current-zone achievement with the rest deferred** — rejected: MVP ships one Zone Attendance achievement for the current raid tier's zone only; remaining zones deferred to Stretch. user clarified they're clearing all zones and want every 40-man zone covered from the start; it's still pure data per goal 6, so no engineering-risk reason to defer it
- **Achievements can be hidden or visible; visible ones show highest-tier-earned plus a progress bar toward the next tier on the character page and Trophy Case; hidden ones occupy no display space until first earned, then move into a dedicated Hidden Achievements Earned section on both surfaces** — rejected: All achievements always visible with a locked/grayed state, no hidden concept and no progress display. user specified this directly — mirrors Season 1's hidden-badge concept but adds progress-bar display for visible achievements and a distinct post-first-earn reveal section for hidden ones

## Execution Plan

_Added during Phase 5 handoff. Pick up this contract cold and know exactly how to execute._

### Dependency Graph

```
Season + Achievement Schema + Manual Grant
  ├── Rule Engine + 9 Achievement Definitions  (blocked by Season + Achievement Schema + Manual Grant)
        ├── QStash Evaluation Trigger  (blocked by Rule Engine + 9 Achievement Definitions)
        └── Retire Season 1 Badges  (blocked by Rule Engine + 9 Achievement Definitions, Reveal Overlay + FAB + Trophy Case)
  └── Reveal Overlay + FAB + Trophy Case  (blocked by Season + Achievement Schema + Manual Grant)
```

### Execution Steps

**Run the project** (recommended) — autopilot reads this contract, plans dependency waves, runs independent phases in parallel, and gates on failure:

```bash
/ideation:autopilot docs\ideation\achievement-engine\contract.md
```

**Or run it unattended** — a `/goal` is a durability wrapper around the same autopilot run: Claude re-checks the condition before it is allowed to stop, so failures get repaired and re-run. Generated by `contract-gen --print-goal`; this is the only copy of that string:

```
/goal Drive the Achievement Engine contract (achievement-engine) to completion with /ideation:autopilot.

1. Run `/ideation:autopilot docs\ideation\achievement-engine\contract.md`.
2. It dispatches a BACKGROUND workflow. Wait for the completion notification — never start a second autopilot run while one is in flight.
3. Then run the ideation plugin's `scripts/verify.mjs` against `docs\ideation\achievement-engine\contract-data.json` and leave its VERIFY line in the conversation. Resolve the plugin's install directory first — `${CLAUDE_PLUGIN_ROOT}/scripts/verify.mjs` is a placeholder, not a shell variable, and bash will not expand it. That line is the only evidence this goal is judged on.
4. If anything failed, fix the spec or the implementation and go back to step 1. Autopilot skips phases that already have commits.

Done when the most recent VERIFY line reads fail=0 and commits=5/5 — or when two consecutive VERIFY lines are identical and still failing, in which case name the failing checks and stop, because a contract whose checks have rotted must not trap the run.
```

**Or run phases manually** in dependency order:

**Strategy**: Hybrid: a sequential foundation (schema) unlocks two parallel phases (rule engine, reveal UI), which converge before a final cleanup phase removes the old system.

1. **Phase 1** — Season + Achievement Schema + Manual Grant _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/achievement-engine/spec-phase-1.md
   ```

2. **Phase 2** — Rule Engine + 9 Achievement Definitions _(blocking)_

   ```bash
   /ideation:execute-spec docs/ideation/achievement-engine/spec-phase-2.md
   ```

3. **Phase 3** — Reveal Overlay + FAB + Trophy Case _(blocked by Season + Achievement Schema + Manual Grant)_

   ```bash
   /ideation:execute-spec docs/ideation/achievement-engine/spec-phase-3.md
   ```

4. **Phase 4** — QStash Evaluation Trigger _(blocked by Rule Engine + 9 Achievement Definitions)_

   ```bash
   /ideation:execute-spec docs/ideation/achievement-engine/spec-phase-4.md
   ```

5. **Phase 5** — Retire Season 1 Badges _(blocked by Rule Engine + 9 Achievement Definitions, Reveal Overlay + FAB + Trophy Case)_

   ```bash
   /ideation:execute-spec docs/ideation/achievement-engine/spec-phase-5.md
   ```

---

_This contract was generated from brain dump input. Review and approve before proceeding to specification._
