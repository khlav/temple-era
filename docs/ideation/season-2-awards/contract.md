# Season 2 Awards Contract (Medals & Trophies)

**Created**: 2026-08-26
**Confidence Score**: 93/100
**Status**: Draft
**Source tickets**: TEMPLE-30 (epic), 27, 29, 31, 32, 33, 34 — revised by design session decisions below

## Problem Statement

The guild's recognition system is a flat list of 14 computed badges with no seasons, no tiers, and no permanence. Members who perform well see the same greyed-out icons everyone else sees; exceptional moments (first KT kill) have nowhere to live; officers can't recognize anyone manually; and nothing about the presentation feels worth earning.

Season 2 introduces a two-lane awards system:

- **Medals** — tiered (bronze/silver/gold/platinum), rule-derived from attendance data, evaluated server-side, **persisted per family at the highest tier achieved for the season** (ratchet: gain but never lose within a season).
- **Trophies** — hand-defined, admin-awarded, permanent, any tier including diamond. No rule engine ever.

Both lanes surface through a shared visual language (parametric SVG `TierMedal` frame + Lucide emblems for bronze–gold, WoW spell/gear icons in non-circular frames for platinum/diamond) and a JRPG-style reveal overlay.

## Design Decisions Locked (this session)

| Decision | Outcome |
|---|---|
| Tiers | bronze / silver / gold / platinum / **diamond** |
| Diamond availability | Manual lane only; medal crossings cap at platinum |
| Medal permanence | Highest tier achieved is kept all season (ratchet); never regresses within season |
| Attribution | Everything at **player/family level** (`familyPrimaryCharacterId`); no per-alt award rows |
| Evaluation windows | Per-medal configurable window; default 6-week rolling, extendable (season-long cumulative rules allowed) |
| TEMPLE-32's freeze mechanism | Obsolete — struck. Server-side evaluation + ratchet recording replaces it |
| Trophy threshold from crossings | Gold + Platinum trigger reveal/trophy-worthy moments |
| Icon sources | Lucide name strings (bronze–gold) · Wowhead CDN hotlinks (platinum/diamond) |
| Frame shapes | Circular for bronze–gold; platinum/diamond frames mocked before final choice (shield vs hexagon vs gem-cut) |
| Naming | "badge" → "medal" throughout code, done during Phase 1 |
| Seasons turn over via | Config constant; bumping it starts fresh medal state (old rows kept as history) |
| Reveal animation style | Spark bursts (additive Canvas2D), slash-through-medal cuts, hit-flash, hero zoom; continuous fireworks for diamond-tier reveals |

## Goals

1. Season 2 medal set (attendance/consistency, roster flexibility & alts, raid variety — no progression/first-kill badges) live on character pages with tier progress visible.
2. Officers can bulk-award trophies to many families in one action, gated behind `trophy:manage`.
3. A persisted, ratcheting record of highest medal tier per family per season exists server-side.
4. New trophy awards and first-time tier crossings trigger the reveal overlay exactly once each.
5. The visual system (TierMedal + frames + emblems) is reusable across character page, dashboard, Trophy Case, and overlay.

## Success Criteria

- [ ] `<CharacterMedals>` renders the Season 2 set with per-tier thresholds and progress toward next tier; hidden+unearned medals render nothing (no count leaks)
- [ ] A family that reaches Gold keeps Gold after their rolling-window attendance drops, within the same season
- [ ] `trophy_award` unique constraint blocks duplicate (trophy, family) rows; bulk-award of one trophy to N families is a single mutation
- [ ] Crossing a trophy-threshold tier inserts exactly one record (idempotent under re-evaluation)
- [ ] Reveal overlay plays once per unseen award, marks `seenAt`, skips correctly when queue is empty
- [ ] All icon references resolve from string names (Lucide static or Wowhead key) — no imported component dependencies in definitions
- [ ] `pnpm typecheck && pnpm test` green in apps/web

## Scope Boundaries

### In Scope

- Vocabulary rename: badge → medal across code (`badge-definitions.ts` → `medal-definitions.ts`, `<CharacterBadges>` → `<CharacterMedals>`, etc.)
- `MedalDefinition` shape: id, name, description, lucide icon name, category, `hidden?`, per-medal evaluation window (default 6wk, extendable), tiers b/s/g/p with thresholds
- Persisted medal state table keyed `(familyPrimaryCharacterId, medalId, season)` → highest tier
- Server-side evaluation path + trigger (page-view-driven or periodic — decided during spec)
- Trophy tables (`trophy`, `trophy_award`) at family level, open-text `source` field, nullable `awardedByUserId`, nullable `seenAt`
- Admin UI: define trophy + bulk-award flow, `TROPHY_MANAGE` scope (new scope enum value + scopes.ts migration)
- Display surfaces v1: character page medals+trophies block, dashboard compact indicator, `/trophies` Trophy Case grouped by definition with source grouping ("Awarded by officers" vs "Earned — Season 2")
- Reveal overlay: spark/slash/flash/zoom sequence, seenAt queue, hybrid batching (first full, rest in results panel), launch-day backfill strategy
- TierMedal SVG component (circular frame b–g; platinum/diamond frames chosen from rendered mock options)

### Out of Scope

- Rule engine / admin-configurable auto-evaluation — the sanctioned trigger is hardcoded to medal thresholds
- Self-serve trophy issuance for non-admins
- Progression/first-kill medals (roster has farmed everything; meaningless this season)
- Character-level attribution of awards (family-level only, per decision)
- Trophy indicator beside every character name everywhere (TEMPLE-34 stretch — separate review after v1 surfaces land)
- Uploading custom artwork per trophy (icons come from Lucide names or Wowhead keys; raw-SVG storage deferred)

### Future Considerations

- Diamond reachable via medal crossings (needs ultra-tier thresholds)
- Raw SVG upload pipeline for bespoke trophy art
- Name-sigil next to every character name render site (Phase 5 stretch, needs callsite inventory)
- Historical season browsing in Trophy Case

## Open Items Carried Into Specs

- Frame shape for platinum/diamond: mock shield vs hexagon vs gem-cut in reveal-overlay.html before implementation
- Trigger point for server-side evaluation (page-view vs periodic job) — decide at spec time with perf considerations
- Legendary-backfill question dies with old rarity names, but equivalent: does first crossing directly at Platinum also record Bronze/Silver/Gold history rows, or only Platinum? (Default: only highest, history implied.)
- Wowhead hotlink reliability fallback (cached/local copies for chosen icons)

---

_This contract was generated from brain dump input + TEMPLE ticket review. Review and approve before proceeding to specification._
