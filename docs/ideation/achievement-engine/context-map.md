# Context Map: achievement-engine

**Phase**: 5
**Gates**: 5/5 ready
**Verdict**: GO

## Gates

| Gate | Status | Evidence |
| --- | --- | --- |
| Scope clarity | ready | Create `docs/followups/season-1-badges-archive.md`; verify `character-detail.tsx` has no `CharacterBadges` reference (confirmed already clean — mounts `AchievementDisplay` at line 169); delete `badge-definitions.ts`, `badge-evaluator.ts`, `character-badges.tsx`. |
| Pattern familiarity | ready | `docs/followups/legacy-access-booleans-cleanup.md` is the archive-doc format to mirror. Both files to archive read in full: 14 `BADGE_DEFINITIONS` entries (id/name/description/rarity) + `BADGE_CATEGORIES`; `evaluateAllBadges`/`evaluateBadge`'s rolling-6-week client-side evaluation. |
| Dependency awareness | ready | Grep confirms exactly one live consumer of each deletion target: `character-badges.tsx` imports both `.ts` files; nothing else imports any of the three. No test files exist for any of them. |
| Edge case coverage | ready | One stale comment found: `achievement-display.tsx:10` mentions `character-badges.tsx` by name — not a build break, not in spec's file list, but worth a one-line fix since it'll reference a deleted file. `docs/followups/season-2-achievements-plan.md` also mentions the old system in prose — intentionally left untouched (historical planning context). |
| Test strategy | ready | No unit tests — pure delete-and-typecheck phase. Validation: typecheck/lint/build + 3 filesystem assertions. |

## Key Patterns

- `docs/followups/legacy-access-booleans-cleanup.md` — followup-doc structure to mirror (H1 title, context paragraph, table for structured facts, prose for rationale).
- `apps/web/src/lib/badge-definitions.ts` — 14 `BADGE_DEFINITIONS` entries (id, name, description, rarity — icon/order are presentational, skip per spec).
- `apps/web/src/lib/badge-evaluator.ts` — rolling-6-week window (`scoringWeeks` = non-historical weeks), per-badge boolean predicates, fully client-side, no persistence.
- `apps/web/src/components/characters/character-detail.tsx:169-173` — already mounts `AchievementDisplay` (Phase 3's swap) — nothing to change here.

## Dependencies

- `badge-definitions.ts` / `badge-evaluator.ts` — consumed only by `character-badges.tsx` (also being deleted). No other consumer anywhere.
- `character-badges.tsx` — not imported anywhere; already fully unmounted since Phase 3.
- Non-code survivors (informational only, not requiring code changes): `achievement-display.tsx:10` comment, `docs/followups/season-2-achievements-plan.md` prose, `docs/followups/mockups/character-badges.html` static asset, ideation-history docs.

## Conventions

- Followup docs: plain Markdown under `docs/followups/`, kebab-case filename, no frontmatter.
- Deletion discipline: delete-then-grep-verify, then let typecheck/build be the final backstop.
- Archived documentation over code preservation: a one-way door, no re-export shims, no `@deprecated` holdovers.

## Risks

- Stale comment in `achievement-display.tsx:10` — fix opportunistically, trivial and safe.
- Archive doc must be written before deleting the source files (content has to be transcribed while it still exists).
- `docs/followups/season-2-achievements-plan.md` intentionally untouched.
