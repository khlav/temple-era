# Implementation Spec: Achievement Engine - Phase 3

**Contract**: ./contract.md
**Estimated Effort**: L

## Technical Approach

This phase can start immediately after Phase 1 (it only needs manually-granted awards to exist, not the rule engine) and runs in parallel with Phase 2. It has two halves that share one component:

1. **The reveal ceremony** — port `docs/followups/mockups/reveal-overlay.html`'s already-validated choreography into a real React component. The mockup's own reference doc (`docs/followups/mockups/reveal-overlay-notes.md`) is the spec for this half: its `Z` layer registry and `buildCueSheet`/`playCueSheet` pattern are ported close to verbatim (same z-index values, same beat timings), with two changes only — real `achievement_award` data replaces the mockup's static test data, and every award's icon is preloaded (`Promise.all` over `Image().onload`) before `playCueSheet` runs, which the mockup itself does not do. Diamond is excluded per the contract's decision — only bronze through platinum port.
2. **The standing display** — a new `achievement-display.tsx` component, shared verbatim between the character page and the Trophy Case (`/trophies`), showing highest-tier-earned + a progress bar for visible achievements, and a "Hidden Achievements Earned" section for hidden achievements the family has earned at least one tier of. The critical invariant here is server-side: an achievement with `hidden: true` and no award for that family must never appear in the tRPC response payload at all — client-side hiding would leak its existence to anyone reading the network tab.

The FAB is a new global-mount pattern — this codebase's only existing "global overlay" is `GlobalQuickLauncher` (a Cmd/Ctrl+K modal, not a floating button), so the FAB is genuinely new UI, not a port of an existing pattern; it's mounted the same way (a sibling of `<GlobalQuickLauncher />` in `layout.tsx`).

## Decisions Considered and Rejected

_Carried from the contract — filtered to phase-relevant entries._

- **Dashboard FAB badged with unseen-award count, mounted globally** — reveal only fires on deliberate click, never automatically. This phase's `reveal-fab.tsx` never auto-opens the overlay; it only ever badges a count.
- **Reveal overlay wired to real `achievement_award` data — preload every icon before the sequence starts, mark `seenAt` on dismiss, hero+strip layout for >1 unseen award** — the already-validated mockup choreography, made real. This is the phase's central deliverable.
- **Trophy Case surface with a per-award replay button** — replay independent of seen/unseen state, decided during the earlier mockup-design phase. `replayAward` (Phase 3's new query) takes any `achievementAwardId`, not just unseen ones.
- **Phase 3 ports only the bronze→platinum reveal choreography; the mockup's diamond buildup/supernova path stays unported** — rejected: port the full ladder including diamond now. No achievement uses diamond; porting an untested, unused animation path was pure risk with no consumer.
- **Achievements can be hidden or visible; visible ones show highest-tier-earned plus a progress bar; hidden ones occupy no display space until first earned, then move into a dedicated Hidden Achievements Earned section** — rejected: all achievements always visible with a locked/grayed state. This phase's `achievement-display.tsx` and its backing query are the entire implementation of this decision.

## Feedback Strategy

**Inner-loop command**: `pnpm --filter temple-era-web dev` (visual choreography work), `pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts -t mark-seen` (backend half)

**Playground**: Dev server for all three UI components — the reveal overlay especially needs real-time visual iteration the way the mockup itself was built (open in a browser, trigger via a dev-only trigger bar, watch the choreography). Reuse the mockup's own dev-trigger-bar pattern (`.triggers`, z-index 400, per `reveal-overlay-notes.md`) as a temporary local harness if useful during development, but it does not ship.

**Why this approach**: This phase is almost entirely visual/UI work with one already-validated reference implementation to port against — a dev server showing the real thing beats any automated check for judging whether the choreography still feels right.

## File Changes

### New Files

| File Path | Purpose |
| --- | --- |
| `apps/web/src/components/achievements/reveal-overlay.tsx` | Ported ceremony: `Z` registry, cue sheet, hero+strip layout, wired to real award data |
| `apps/web/src/components/achievements/reveal-fab.tsx` | Global floating button, badged with unseen count, opens the reveal overlay |
| `apps/web/src/components/achievements/achievement-display.tsx` | Shared visible/hidden + progress-bar display, used on character page and Trophy Case |
| `apps/web/src/server/services/achievement-queries.ts` | `getUnseenAwards`, `getDisplayCatalog`, `getAwardById` read-models backing the three components above |
| `apps/web/src/app/trophies/page.tsx` | Trophy Case page: `achievement-display.tsx` plus a per-award replay button |

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/server/api/routers/achievement.ts` | Add `getUnseenAwards`, `getDisplayCatalog`, `getAwardById` query procedures |
| `apps/web/src/app/layout.tsx` | Mount `<RevealFab />` as a sibling of `<GlobalQuickLauncher />`, inside the same outer wrapper div |
| `apps/web/src/components/nav/app-header.tsx` | Add a "Trophies" entry to `primaryNav` (`{ label: "Trophies", href: "/trophies" }`) |
| `apps/web/src/lib/app-pages.ts` | Add the same Trophies destination so it's searchable via the Global Quick Launcher (the shared source of truth between the header menu and Cmd+K search) |
| `apps/web/src/components/characters/character-detail.tsx` | Replace the `<CharacterBadges characterId={characterId} />` card (lines ~167-171) with `<AchievementDisplay primaryCharacterId={characterData.primaryCharacterId ?? characterId} />`, same `Card`/`CardContent` wrapper |

## Implementation Details

### achievement-queries.ts: getUnseenAwards / getDisplayCatalog / getAwardById

**Pattern to follow**: `apps/web/src/server/services/achievement-rules.ts`'s `getHighestTierPerAchievement`/`getNextTierProgress` from Phase 2 — this file composes those rather than re-deriving tier logic.

**Overview**: Three read-models, each shaped for exactly one consumer, so no component does its own data reshaping.

```typescript
export interface UnseenAward {
  achievementAwardId: string;
  achievementId: string;
  name: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  awardedAt: Date;
}
export async function getUnseenAwards(db: DB, primaryCharacterId: number): Promise<UnseenAward[]>;
// achievement_award JOIN achievement_tier JOIN achievement, WHERE seen_at IS NULL AND primary_character_id = :id,
// ordered rarest-tier-first (platinum > gold > silver > bronze) then most-recently-awarded, for hero selection.

export interface DisplayAchievement {
  achievementId: string;
  name: string;
  icon: string;
  highestTierEarned: "bronze" | "silver" | "gold" | "platinum" | null;
  progress: { nextTier: string; current: number; target: number } | null; // null = maxed out or manual (no rule)
}
export interface DisplayCatalog {
  visible: DisplayAchievement[];
  hiddenEarned: DisplayAchievement[]; // hidden achievements with at least one award; progress is always null here (never shown for hidden)
}
export async function getDisplayCatalog(db: DB, primaryCharacterId: number): Promise<DisplayCatalog>;
// Reads achievement WHERE hidden = false (→ visible, always included even with zero awards, per goal 7's
// "always renders... or 'not yet earned'") UNION achievement WHERE hidden = true AND EXISTS(an award for
// this family) (→ hiddenEarned). A hidden achievement this family hasn't earned is never queried into the
// response shape at all — not filtered client-side, never fetched.

export async function getAwardById(db: DB, achievementAwardId: string): Promise<UnseenAward | null>;
// Backs Trophy Case replay — works regardless of seenAt, unlike getUnseenAwards.
```

**Key decisions**:

- `getDisplayCatalog`'s hidden-achievement exclusion happens in the SQL `WHERE`/`EXISTS`, not in application code after a broader fetch — this is the one place a bug would actually leak a hidden achievement's existence over the network, so it gets the strictest possible implementation.
- `progress` is `null` for manual-only achievements (no `ruleConfig` on any of their tiers) as well as for a maxed-out achievement — the display component treats both the same way (no progress bar shown), it doesn't need to distinguish why.

**Feedback loop**:

- **Playground**: extend `achievement.test.ts` with a `describe("achievement-queries")` block using the same DB-mock pattern.
- **Experiment**: a hidden achievement with zero awards (must not appear in either `visible` or `hiddenEarned`); the same achievement after a manual grant (must now appear in `hiddenEarned`); a visible achievement at platinum (progress `null`, not an error).
- **Check command**: `pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts -t display-catalog`

### reveal-overlay.tsx (ceremony port)

**Pattern to follow**: `docs/followups/mockups/reveal-overlay.html` + `docs/followups/mockups/reveal-overlay-notes.md` — the layer stack and beat-timeline tables in that doc are the literal spec for this component; do not re-derive timings, copy them.

**Overview**: A client component taking a batch of awards (hero = rarest/most-recent, up to 5 more in the strip, per the mockup's existing multi-award design) and rendering the exact choreography the notes document, gated on every icon finishing preload first.

```typescript
interface RevealOverlayProps {
  awards: UnseenAward[]; // already sorted hero-first by the caller (getUnseenAwards' ordering)
  onDismiss: () => void; // caller is responsible for calling markSeen with the shown award IDs
}
export function RevealOverlay({ awards, onDismiss }: RevealOverlayProps): JSX.Element | null;
```

**Key decisions**:

- The `Z` layer-registry object and `buildCueSheet`/`playCueSheet` functions port with the same names and values documented in `reveal-overlay-notes.md`'s tables — a future timing change should be a one-line edit to a cue's `t` value, exactly like the mockup, not a re-discovery of the choreography.
- Preload is new (the mockup doesn't have it): `await Promise.all(awards.map(a => new Promise(resolve => { const img = new Image(); img.onload = resolve; img.onerror = resolve; img.src = a.icon; })))` runs before `playCueSheet` is invoked — an icon that fails to load still resolves (via `onerror`) rather than hanging the reveal forever.
- `onDismiss` is a caller-provided callback rather than the component calling `markSeen` itself — keeps this component free of tRPC/mutation concerns; `RevealFab` (below) owns the actual mutation call.

**Implementation steps**:

1. Copy the mockup's CSS (layer stack, keyframes, `Z` custom properties) into a component-scoped stylesheet or CSS module.
2. Port the `Z` object, `buildCueSheet`, `playCueSheet`, `runImpact`/`IMPACT` ladder, and `fireSparks` verbatim, adapted from vanilla-DOM manipulation to refs where the component needs to read award data (icon URLs, tier, name) into the existing template structure.
3. Drop `runDiamondBuildup`/`fireSupernova`/`DIAMOND_CADENCE` and the blackout beats that only diamond uses beyond what gold/platinum already share — bronze through platinum only.
4. Wire the preload gate in front of the existing `runCrossing` entry point.
5. Wire the multi-award strip (`buildCueSheet`'s `onSettle` → `showStrip()`) to `awards[1..5]`.

**Feedback loop**:

- **Playground**: `pnpm dev`, a temporary dev-only trigger (or Storybook, if the project has it — confirm) rendering `<RevealOverlay awards={fixtureAwards} onDismiss={() => {}} />` with 1, 3, and 6 fixture awards.
- **Experiment**: 1 award (hero only, no strip, matches the mockup's existing "no shift" behavior); 6 awards (strip caps at 5 shown, per the existing mockup's cap); a slow/failing icon URL (confirm preload still resolves via `onerror` and the reveal starts).
- **Check command**: none automatable for the visual choreography itself — judged per success criteria 21/22 (browser side-by-side against the mockup).

### reveal-fab.tsx

**Pattern to follow**: `apps/web/src/components/ui/global-quick-launcher.tsx` (global-mount + context pattern), `apps/web/src/app/layout.tsx` (mount site)

**Overview**: A fixed-position button, badged with `getUnseenAwards().length`, that opens `RevealOverlay` with the current unseen batch and calls `markSeen` on dismiss.

```typescript
export function RevealFab(): JSX.Element | null {
  const { data: unseen } = api.achievement.getUnseenAwards.useQuery();
  const markSeen = api.achievement.markSeen.useMutation();
  const [open, setOpen] = useState(false);
  if (!unseen || unseen.length === 0) return null;
  // renders a fixed bottom-right button with a count badge; onClick sets open(true)
  // renders <RevealOverlay awards={unseen} onDismiss={() => { markSeen.mutate({ achievementAwardIds: unseen.map(a => a.achievementAwardId) }); setOpen(false); }} /> when open
}
```

**Key decisions**: no dedicated global "FAB" pattern exists in this codebase yet (confirmed during research — `GlobalQuickLauncher` is a Cmd/Ctrl+K modal, not a floating button); this component establishes the pattern rather than following one. Uses plain `position: fixed` (the only prior art for a globally-positioned overlay, `compare-tray.tsx`, is page-scoped and not a close enough pattern to follow directly).

**Feedback loop**:

- **Playground**: `pnpm dev`, seed a manual award via Phase 1's admin UI, confirm the FAB appears badged with `1`.
- **Experiment**: zero unseen awards (FAB renders nothing — confirmed above via early return); dismiss, then reload the page (FAB should be gone, since `seenAt` is now set).
- **Check command**: none automatable — judged per success criterion 20 (browser click-through).

### achievement-display.tsx

**Pattern to follow**: `apps/web/src/components/characters/character-badges.tsx` (the component being replaced) for the overall "fetch + render tiered groups" shape, but data comes from `getDisplayCatalog` instead of client-side `evaluateAllBadges`.

**Overview**: Renders `DisplayCatalog.visible` (highest tier earned or "not yet earned," plus a progress bar toward `nextTier` when `progress` is non-null) and, only if non-empty, a "Hidden Achievements Earned" section rendering `DisplayCatalog.hiddenEarned` the same way minus the progress bar (hidden achievements never show progress, even after being earned, since a hidden achievement's next tier is itself part of the surprise).

```typescript
export function AchievementDisplay({ primaryCharacterId }: { primaryCharacterId: number }): JSX.Element;
```

**Key decisions**: one component, two call sites (character page, Trophy Case) — no prop for "which page it's on," since the display logic (visible-with-progress, hidden-only-after-earned) is identical in both places per the contract's explicit design. The Trophy Case page adds the replay button as a wrapper around this component's award items, not as a prop this component needs to know about.

**Implementation steps**:

1. `const { data } = api.achievement.getDisplayCatalog.useQuery({ primaryCharacterId })`.
2. Render `data.visible` grouped/sorted however `character-badges.tsx` currently groups by rarity, adapted to tier + progress bar.
3. Render `data.hiddenEarned` in a visually distinct "Hidden Achievements Earned" section, omitted entirely (not even an empty-state message) when `hiddenEarned.length === 0` — an empty section header would itself hint that hidden achievements exist to find.

**Feedback loop**:

- **Playground**: `pnpm dev` on both the character page and `/trophies`.
- **Experiment**: a family with zero achievements of any kind (visible achievements still show as "not yet earned," no Hidden section at all); a family with one earned hidden achievement (Hidden section appears with exactly that one).
- **Check command**: none automatable for rendering — judged per success criterion 16 (reviewer seeds specific states and checks both surfaces).

### Trophy Case page + replay

**Overview**: `/trophies` renders `<AchievementDisplay primaryCharacterId={session's own family} />` plus a play-button overlay per earned award that calls `getAwardById` and opens `RevealOverlay` with that single award, independent of `seenAt`.

**Implementation steps**:

1. Build the page around `AchievementDisplay`, adding a replay icon-button to each earned achievement's tier badge.
2. Replay click → `api.achievement.getAwardById.useQuery(achievementAwardId, { enabled: false })` fired on demand (`refetch()`) → open `RevealOverlay` with a single-award array → `onDismiss` just closes, no `markSeen` call (already seen, replay doesn't need to re-mark).

**Feedback loop**:

- **Playground**: `pnpm dev`, navigating to `/trophies` with fixture/seeded award data.
- **Experiment**: replay on an already-seen award (confirm no `markSeen` call fires — check the network tab); replay on an achievement with multiple crossed tiers (confirm the replay button plays the correct specific tier's crossing, not always the highest).
- **Check command**: none automatable — judged visually alongside success criterion 20.

## API Design

### New tRPC Procedures (`achievement` router, added to Phase 1's)

| Procedure | Type | Scope | Description |
| --- | --- | --- | --- |
| `getUnseenAwards` | query | none (own-family) | Backs the FAB badge count and reveal overlay's hero+strip batch |
| `getDisplayCatalog` | query | none | Backs `achievement-display.tsx`; hidden-and-unearned achievements never appear in the response |
| `getAwardById` | query | none | Backs Trophy Case replay; works regardless of `seenAt` |

## Testing Requirements

### Unit Tests

| Test File | Coverage |
| --- | --- |
| `apps/web/src/server/api/routers/__tests__/achievement.test.ts` (extended) | `getDisplayCatalog`'s hidden-achievement exclusion (the security-relevant case), `getUnseenAwards` ordering |

**Key test cases**:

- A hidden achievement with zero awards for the family never appears in `getDisplayCatalog`'s response, in either bucket.
- The same achievement, after a manual grant, appears in `hiddenEarned` with `progress: null`.
- `getUnseenAwards` orders platinum before gold before silver before bronze, and within the same tier, most-recent first.

### Manual Testing

- [ ] Seed a visible achievement mid-progress (Phase 1's admin UI grants a lower tier, or use Phase 2 test fixtures) — confirm the progress bar shows on both the character page and `/trophies`.
- [ ] Seed a hidden achievement, confirm it's invisible everywhere; grant it; confirm it now appears in "Hidden Achievements Earned" on both surfaces.
- [ ] Click the FAB with 3 unseen awards of different tiers — confirm the rarest is the hero and the rest appear in the strip in the mockup's documented order/timing.
- [ ] Dismiss the reveal, reload — confirm the FAB is gone and the awards show as seen.
- [ ] Trophy Case replay on an already-seen award — confirm it re-plays without re-triggering the FAB or re-marking anything.

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `getDisplayCatalog` | Hidden-and-unearned achievement leaks into the response | A future edit adds a new field/join that bypasses the `EXISTS` filter | Spoils the surprise for every player inspecting network traffic | Keep the hidden-exclusion filter as the query's own `WHERE`, covered by the dedicated unit test above — never re-filter client-side as the primary defense |
| `RevealOverlay` | Icon URL 404s or times out | Broken/missing icon asset for an achievement | Preload `Promise.all` could hang forever without the `onerror` handler | `onerror` resolves the same as `onload` — reveal starts on a broken image rather than never starting |
| `RevealFab` | Unseen count query races with a concurrent grant/evaluation | An officer grants an award while the raider has the dashboard open | FAB badge count is stale until next refetch | Acceptable — same staleness class as any other polling-free tRPC query in this app; not worth a websocket for this |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
pnpm --filter temple-era-web vitest run src/server/api/routers/__tests__/achievement.test.ts
pnpm --filter temple-era-web build
```

## Rollout Considerations

- **Feature flag**: none — safe to ship ahead of Phase 4 (QStash triggers), since manually-granted awards already exercise the full display/reveal/replay path end to end.
- **Monitoring**: none beyond normal Vercel/PostHog page-view tracking already in place.
- **Rollback plan**: UI-only phase (plus 3 new read-only query procedures) — reverting is a straight revert with no data migration to undo.

## Open Items

- [ ] Confirm whether this project has Storybook (feedback-loop-guide.md prefers it over a bare dev server for isolated component work) — the research pass this spec is based on didn't check.
- [ ] Confirm `character-detail.tsx`'s `characterData` shape actually exposes a `primaryCharacterId` field (or the equivalent "which family does this character belong to" value) to pass into `AchievementDisplay` — the research pass confirmed the `characters.primaryCharacterId` column but not what `character-detail.tsx`'s existing query already returns.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
