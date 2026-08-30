# Implementation Spec: Tradeskill Mastery Tiers - Phase 2

**Contract**: ./contract.md
**Estimated Effort**: S

## Technical Approach

Replace each achievement section's full-width `<h4>` header row with a vertically rotated label positioned to the left of that section's chip grid, separated by a light divider (`border-r`). No CSS file changes needed — Tailwind's arbitrary-property syntax (`[writing-mode:vertical-rl]`) plus the existing `rotate-180` utility does the rotation inline.

The height requirement ("should stretch to cover multiple rows if that section wraps") falls out of plain flexbox for free: wrapping each section in a `flex flex-row` container (default `align-items: stretch`) means the label column automatically stretches to match the chip grid's actual rendered height, wrapped rows included — no explicit height calculation, no JS measurement.

Extract a small `AchievementSection` wrapper component (label + children) since the pattern repeats 3 times (Core, Classes, Legendary Feats) with only the label and inner content varying.

## Decisions Considered and Rejected

_Carried from the contract (Phase 2-relevant entries)._

- **Compact display: rotated left-rail section label with divider, spanning wrapped row height, replacing the full-width header row** — scoped to character/achievement pages only (not the admin panel's own layout, which gets only the new Tradeskill tab from Phase 1, not this treatment).
- Text orientation (bottom-to-top vs. top-to-bottom reading) was not put to the user as a question — bottom-to-top (`[writing-mode:vertical-rl] rotate-180`) is the standard sidebar/tab-label convention and was chosen directly as a low-stakes, easily-reversible visual call. Flag for the user's review rather than treating as locked.

## Feedback Strategy

**Inner-loop command**: `pnpm dev` (a dev server is normally already running on :3000 or :3001 — check before starting a new one, per AGENTS.md) plus a browser reload of `/achievements` and a character detail page.

**Playground**: dev server, visual inspection.

**Why this approach**: This is a pure layout/CSS change with no logic to unit test — the only meaningful verification is seeing it render correctly at multiple viewport widths and section-wrap states, which is exactly what the contract's judgment criterion asks for.

## File Changes

### Modified Files

| File Path | Changes |
| --- | --- |
| `apps/web/src/components/achievements/achievement-display.tsx` | Add `AchievementSection` wrapper component; replace the 3 `<h4>`-above-`ChipPanel` blocks (Core, Classes, Legendary Feats) with `<AchievementSection label="...">` wrapping the existing `ChipPanel`. |

## Implementation Details

### AchievementSection wrapper

**Pattern to follow**: the existing `ChipPanel` component in the same file (same "small presentational component, no card chrome of its own" convention noted in its doc comment).

**Overview**: A flex-row container: a narrow rotated-label column with a right divider, then the section's content (a `ChipPanel`) taking the remaining width.

```typescript
/** Replaces the old full-width `<h4>` header row: the label rotates 90deg and sits to the left
 *  of the section's chip grid instead of above it, with a divider between them. `flex-row`'s
 *  default `align-items: stretch` is what makes the label column span the grid's full height for
 *  free, wrapped rows included — no explicit height math needed. */
function AchievementSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-row gap-3">
      <div className="flex w-6 shrink-0 items-center justify-center border-r border-border">
        <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
```

**Key decisions**:

- `rotate-180` on top of `[writing-mode:vertical-rl]` makes the label read bottom-to-top (the common sidebar/tab-label convention). Drop `rotate-180` for top-to-bottom instead, if the visual review prefers that.
- `min-w-0` on the content wrapper guards against a classic flex/grid gotcha: without it, a flex item won't shrink below its content's intrinsic width, which can silently break the grid's own wrapping/overflow behavior at narrow viewports.
- `w-6` (24px) for the label column — plenty for `text-xs` vertical text regardless of label length, since the text flows along the height axis, not the width axis.

**Implementation steps**:

1. Add the `AchievementSection` function above `AchievementDisplay` (near `ChipPanel`, `MoreHiddenChip`).
2. Replace:
   ```tsx
   <div className="flex flex-col gap-2">
     <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
       Core
     </h4>
     <ChipPanel achievements={seasonCore} onReplay={setReplayAwardId} />
   </div>
   ```
   with:
   ```tsx
   <AchievementSection label="Core">
     <ChipPanel achievements={seasonCore} onReplay={setReplayAwardId} />
   </AchievementSection>
   ```
   Same substitution for the Classes block and the Legendary Feats block (the latter keeps its existing `hiddenEarned.length > 0 &&` guard around the whole `AchievementSection`, and its `trailing={<MoreHiddenChip />}` prop passes through to the inner `ChipPanel` unchanged).
3. Remove the now-unused `<h4>` header styling if nothing else in the file references that exact class string (check before deleting anything shared).

**Feedback loop**:

- **Playground**: dev server, `/achievements` (signed in and signed out) and a character detail page's Achievements card.
- **Experiment**: a section with 1 row of chips, a section that wraps to 3+ rows (widest is Core, which has the most entries), and the narrowest supported viewport (mobile) where the grid drops to `grid-cols-4`.
- **Check command**: none (visual) — reload the page and look.

## Testing Requirements

### Manual Testing

- [ ] `/achievements`, signed in: Core/Classes/Legendary Feats sections all show a rotated left-rail label with a divider instead of a header row.
- [ ] `/achievements`, signed out (public catalog): same layout, no earned-chip styling differences from before.
- [ ] A character detail page's Achievements card: same layout inside the existing card chrome.
- [ ] Narrow (mobile) viewport: label rail still renders correctly next to the 4-column grid; no horizontal overflow.
- [ ] A section that wraps to multiple grid rows (Core, with its 8+ entries): confirm the label rail's divider runs the full height of all wrapped rows, not just the first.
- [ ] Chip tooltips and the replay-on-click interaction still work unchanged (this refactor doesn't touch `AchievementChip` or `ChipPanel` internals).

## Failure Modes

| Component | Failure Mode | Trigger | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| `AchievementSection` | Label column doesn't stretch to full grid height | A CSS reset or ancestor `align-items` override defeats flexbox's default `stretch` | Divider looks visually short, floating above blank space | Verify visually per the manual testing above; if it happens, an explicit `self-stretch` on the label column's own class is the fallback fix |
| `AchievementSection` | Grid overflows horizontally at narrow widths | `min-w-0` omitted or insufficient | Page gets horizontal scroll (violates AGENTS.md's "page body must never scroll horizontally" convention used elsewhere in this codebase) | `min-w-0` on the content wrapper, confirmed in manual testing at mobile width |

## Validation Commands

```bash
pnpm --filter temple-era-web typecheck
pnpm --filter temple-era-web lint
```

## Rollout Considerations

- **Feature flag**: none — pure visual change, no data model impact.
- **Monitoring**: none.
- **Rollback plan**: revert the component change; no data migration involved.

## Open Items

None.

---

_This spec is ready for implementation. Follow the patterns and validate at each step._
