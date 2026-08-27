# Implementation Spec: Achievement Engine - Phase 5

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

The smallest, lowest-risk phase, and deliberately last: by the time this runs, Phase 3 has already replaced `character-badges.tsx`'s mount site in `character-detail.tsx` with `achievement-display.tsx`, so `character-badges.tsx`, `badge-definitions.ts`, and `badge-evaluator.ts` are already fully unused dead code by the time this phase deletes them. This is a straight rip-and-replace with one required step first: archive the old badge catalog to documentation before deleting it, per the contract's explicit instruction to preserve "documentation on what the achievements were + the rules," nothing more.

## Decisions Considered and Rejected

_Carried from the contract — filtered to phase-relevant entries._

- **Rip out and replace Season 1's badge system entirely, archiving old definitions/rules to documentation only** — rejected: Coexist alongside the new permanent achievement system. User explicitly said "no need to preserve anything more than documentation" — avoids maintaining two parallel recognition systems. This phase is that decision executed.

## Feedback Strategy

**Inner-loop command**: `test ! -f apps/web/src/lib/badge-definitions.ts && test ! -f apps/web/src/lib/badge-evaluator.ts && test -f docs/followups/season-1-badges-archive.md`

**Playground**: None — this is a delete-and-typecheck phase, not an iterative-development one.

**Why this approach**: The only thing that can go wrong here is a lingering import of a deleted file, which `typecheck`/`build` catch immediately.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `docs/followups/season-1-badges-archive.md` | Preserves the Season 1 badge catalog (all 14 `BADGE_DEFINITIONS` entries: id, name, description, rarity) and a one-paragraph description of `evaluateAllBadges`'s rolling-6-week-window evaluation approach, for historical reference only |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/components/characters/character-detail.tsx` | Confirm no remaining reference to `CharacterBadges` (Phase 3 already swapped the mount site — this is a verification step, not new work) |

### Deleted Files

| File Path | Reason |
| --- | --- |
| `apps/web/src/lib/badge-definitions.ts` | Season 1's ephemeral badge catalog — superseded by `achievement-definitions.ts` (Phase 2); content preserved in the archive doc first |
| `apps/web/src/lib/badge-evaluator.ts` | Season 1's client-side rolling-window evaluator — superseded by `achievement-rules.ts` (Phase 2) |
| `apps/web/src/components/characters/character-badges.tsx` | Season 1's display component — superseded by `achievement-display.tsx` (Phase 3), already unmounted by that phase |

## Implementation Details

### Archive doc

**Overview**: A plain Markdown snapshot of `BADGE_DEFINITIONS` (all 14 entries — id, name, description, rarity — read directly from `badge-definitions.ts` before deleting it) and a short description of how `evaluateAllBadges` worked, so the historical badge list and evaluation approach remain discoverable after the code is gone.

**Implementation steps**:

1. Read `apps/web/src/lib/badge-definitions.ts` and `apps/web/src/lib/badge-evaluator.ts` in full.
2. Write `docs/followups/season-1-badges-archive.md`: a table of all 14 badges (id/name/description/rarity), plus a short paragraph on the rolling-6-week-window, client-side evaluation approach and why it was replaced (permanence + officer-manual-grant needs — link to `docs/ideation/achievement-engine/contract.md`'s problem statement rather than restating it).
3. Delete the three files.
4. Grep the codebase for any remaining import of `badge-definitions`, `badge-evaluator`, or `CharacterBadges` — should return nothing given Phase 3 already did the swap; if anything remains, that's a signal Phase 3's file list missed a reference.

**Feedback loop**: none — this is the validation-commands section's job (typecheck/build catch a missed import immediately).

## Testing Requirements

### Manual Testing

- [ ] `pnpm --filter temple-era-web typecheck && pnpm --filter temple-era-web build` both succeed with the three files deleted.
- [ ] The character page still renders `achievement-display.tsx` correctly with no console errors about a missing `CharacterBadges` import.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| Delete step | A file outside `character-detail.tsx` still imports one of the three deleted files | Phase 3's file list missed a reference (e.g., a test file, a Storybook story) | Build fails | `typecheck`/`build` catch this immediately; grep before deleting as a pre-check per the implementation steps above |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
pnpm --filter temple-era-web build
test ! -f apps/web/src/lib/badge-definitions.ts
test ! -f apps/web/src/lib/badge-evaluator.ts
test -f docs/followups/season-1-badges-archive.md
```

## Rollout Considerations

- **Feature flag**: none.
- **Monitoring**: none.
- **Rollback plan**: `git revert` restores the three deleted files verbatim if ever needed; the archive doc is additive and harmless to keep either way.

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
