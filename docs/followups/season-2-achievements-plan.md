# Season 2 Achievements & Trophies — Implementation Plan

Plan for the [Epic] Season 2 Achievements & Trophies effort (TEMPLE-30), covering
TEMPLE-27, TEMPLE-29, TEMPLE-31, TEMPLE-32, TEMPLE-33, and TEMPLE-34.

## Core idea

Two systems that meet in the middle, feeding one unified award table:

- **Season 2 achievements** (TEMPLE-29) — computed badges evaluated just-in-time
  against a rolling 6-week attendance window (`badge-evaluator.ts`). No persistence;
  replace-in-place.
- **Trophies** (TEMPLE-27) — persisted, hand-defined, admin-awarded. Definition
  table + join table. No rule engine, ever.
- **Automated tier-crossing awards** (TEMPLE-32) — *one potential way* trophies are
  achieved, not the only one: when a character crosses an achievement tier, that
  moment is frozen into a permanent Trophy automatically.

### Awarding lanes

`trophy_award` is a single unified feed with pluggable **sources**:

| Lane | Source value | Ticket | Notes |
|---|---|---|---|
| Admin manual award | `"manual"` | TEMPLE-27 | Fully functional standalone; ships in Phase 2 with no dependency on automation |
| Automated tier-crossing | `"season_achievement"` | TEMPLE-32 | System-awarded; one lane among possible future ones |

Schema implication: keep `trophy.source` as an open text column (not a Postgres
enum) so future lanes don't need a migration. `trophy_award.awardedByUserId`
nullable covers both human and system awarders (`null` = system).

## Phases

### Phase 1 — Season 2 badge set (TEMPLE-29 + hidden subset of TEMPLE-31)

Swap `BADGE_DEFINITIONS` and `evaluateBadge()` contents. Themes: harder
attendance/consistency tiers, roster flexibility & alts (off-role, bench fills),
raid variety/exploration. Add `hidden?: boolean` to `BadgeDefinition`;
`<CharacterBadges>` skips hidden badges until earned.

**Tier structure — decided:** each Season 2 achievement is a single badge with four
tiers: **bronze / silver / gold / platinum**, replacing the current five-value
`BadgeRarity` (`common | uncommon | rare | epic | legendary`). Keep internal rarity
values mapped to bronze/silver/gold/platinum display names (decided before Phase 1
starts so definitions aren't churned twice). Instead of inventing 4× more badges,
each behavior gets one definition with four thresholds.

- Schema changes: none
- Estimate: ~1 day (mostly design decisions on the actual badge list)

### Phase 2 — Trophy data model + manual awarding (TEMPLE-27)

1. Drizzle migration:
   - `trophy` — definition: name, description, SVG, createdBy
   - `trophy_award` — join: trophyId, characterId, awardedAt, awardedByUserId,
     unique `(trophyId, characterId)`
2. tRPC router gated by a new `TROPHY_MANAGE` scope via `scopedProcedure`; bulk-award
   mutation (one trophy → N characters in one call)
3. Surfaces v1: character detail block beside `<CharacterBadges>`, compact dashboard
   indicator, `/trophies` Trophy Case grouped by definition, grouping awards by
   source where relevant ("Awarded by officers" vs. "Earned in Season 2") rather
   than assuming season achievements are the primary story

Resolve before starting: SVG storage (inline Postgres text column vs. asset upload).

- Estimate: ~2 days including migration + UI

### Phase 3 — Automated tier-crossing awards (TEMPLE-32)

Additive enhancement on top of Phase 2's manual lane.

- Move badge evaluation server-side (today it's client-only inside
  `<CharacterBadges>`); decide trigger: page-view-driven vs. periodic job — the main
  open decision
- Check-and-award path auto-creates tier trophy definitions on crossing an awarded
  tier ("Bench Depth — Gold (Season 2)"), reusing the achievement's icon;
  idempotency via the existing unique constraint
- **Trophy threshold — decided: gold + platinum.** Platinum-only would be reached by
  ~1–3 raiders per achievement while ephemeral badges decay; awarding at both tiers
  gives a real chunk of the roster something permanent and gives the Phase 4 reveal
  overlay enough traffic to matter
- Estimate: ~1–2 days; server-side evaluation is the risk item (no precedent in codebase)

### Phase 4 — Reveal overlay (TEMPLE-33)

- `trophy_award.seenAt` nullable timestamp — `null` = unseen. Doubles as the "when
  did they see it" record, so no separate boolean flag needed.
- **Trigger — decided: never automatic.** Dashboard gets a FAB (bottom-right)
  badged with the unseen count; the reveal only fires on click. "Checks unseen
  awards on load" means fetching that count to badge the FAB, not auto-playing
  anything — the animation is always the result of a deliberate click.
- **Seen state — decided:** marked on dismiss (after the reveal finishes playing),
  not on FAB click, so a closed tab mid-animation doesn't silently lose the award.
- **Unseen scope — open:** does the FAB aggregate unseen awards across all of a
  person's characters/alts, or per-character (shown on that character's own page)?
  "Collect medals over time and show them all when someone visits" reads as
  account-wide, but the query scope needs confirming before Phase 4 starts.
- **Backfill — decided direction:** launch-day migration should stamp `seenAt` for
  every pre-existing award rather than leaving it `null`, so day-one login doesn't
  trigger a reveal of every historical crossing at once. (Supersedes the old
  "decide backfill strategy" open item.)
- **Preload — decided:** every icon the batch needs must finish loading
  (`Promise.all` over `Image().onload`) before the reveal's timing sequence starts.
  No beat should begin against an image that isn't already in the browser cache —
  today's `reveal-overlay.html` mockup does NOT do this (plain `<img src>` at
  animation start) and would need this added for real wiring.
- **Replay — decided:** the Trophy Case (`/trophies`) gets a small play button per
  award that re-fires its reveal on demand, independent of seen/unseen state.
- **Multiple unseen awards — decided (supersedes "serial vs. consolidated"):** one
  hero reveal — rarest tier, ties broken by most-recently-earned — plus up to 5
  more in a horizontal strip that slides in below it (hero content shifts up to
  make room). Strip items animate in left to right: fade in, starting larger and
  settling smaller, each item's label rising in from the bottom as it settles.
  This is the better-scoped replacement for the flat-list "season haul" concept
  explored (and discarded) in `reveal-overlay.html` — same underlying need, shaped
  around what a real "you have N unseen awards" pull actually requires.
  - One award only: no strip, no "shift up" — just the hero, same as today.
  - Open: past 6 total in one sitting, hard-cap the strip at 5 and truncate
    silently, or add a "+N more" affordance?
- Mockup: `docs/followups/mockups/reveal-strip.html` — hero + strip layout only,
  not wired to real data; reuses the medal art from `reveal-overlay.html`.
- Lands after Phase 3 so the unified feed has both manual and automated awards
  flowing through when the animation ships — but it reads the feed regardless of
  source, so it naturally covers any future lane too.
- Estimate: ~1 day + animation polish, before accounting for the FAB/preload/strip
  work above — likely a light revision once that's scoped for real.

### Phase 5 — Extra surfaces & polish (TEMPLE-34)

Dashboard compact indicator refinements, Trophy Case grouping rolled up to
character-family level, then the stretch goal: trophy icon next to character names
everywhere (needs an inventory of name-render sites — do not design blind).

## Dependency chain

```
Phase 1 ──┐
          ├─→ Phase 3 ─→ Phase 4
Phase 2 ──┘              (33 needs 32's automated lane live, but reads the
                          source-agnostic feed, so future lanes come free)
Phase 5 last, after visual language proves out
```

Phases 1 and 2 are independent — they can run as two parallel branches.
