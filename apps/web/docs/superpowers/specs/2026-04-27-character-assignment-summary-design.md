# Character Assignment Summary Panel

**Date:** 2026-04-27
**Status:** Approved

## Overview

When a user views a public raid plan (`/raid-plans/:id`) with a character selected via the "View as" selector, show a character-specific assignment summary panel. The panel gives the selected character a quick overview of every encounter where they have an AA assignment, including the full template line(s) where they appear — so they can see context, not just a slot name.

## Goals

- Give raiders a "what am I doing tonight?" at-a-glance view without clicking through every encounter tab.
- Surface the full AA line (not just the slot name) so role context is clear.
- Zero new API calls — all data is already returned by `getPublicById`.

## Non-Goals

- No changes to the encounter sidebar, AA panel, or groups grid.
- No server-side changes.
- No support on the edit view (`/raid-manager/raid-planner/:id`) — public view only for now.

## UI Behavior

### Placement

The panel renders between the `<Separator>` and the `<Tabs>` block in `RaidPlanPublicView`, full-width. It is only rendered when `viewAsCharacterId !== null` and `viewAsCharacter` has loaded.

### Summary line

```
<ClassIcon> CharacterName has assignments in EncounterA (RoleX, RoleY), EncounterB (RoleZ), EncounterC (RoleW), and N more encounters.
```

- Character name is class-colored and bold.
- Encounter names are white and bold.
- Slot names render as small purple-tinted role pills.
- First 3 encounters shown inline; when there are more than 3, the remainder is collapsed into an "and N more encounters." tail (normal weight, not muted or italic). When there are 3 or fewer, no tail is shown.
- Default/Trash is included if the character has assignments there; it appears as "Default/Trash" and sorts first.

### Collapsible details

- A "Hide details / Show details" toggle button sits at the top-right of the panel.
- Details are **expanded by default**.
- Details section lays out encounter blocks in a responsive grid: 3 columns on `lg`, 2 columns on `md`, 1 column on smaller screens.
- Each block shows:
  - The encounter name as a small clickable header with a purple left-border accent. Clicking it sets `activeTab` to that encounter's ID (switching the encounter view below). Default/Trash sets `activeTab` to `"default"`.
  - A monospace AA block containing only the template lines relevant to the character (see Line Extraction below), rendered via the existing `AATemplateRenderer` in `readOnly` + `hideUnassigned` mode, with `userCharacterIds` passed for highlighting.
  - The character's name is highlighted inside the AA block with a purple-tinted background badge.
  - The entire block has a hover state (subtle border brightening) to indicate it's clickable.
- Blocks are ordered: Default/Trash first, then by encounter `sortOrder`.

### No-assignments state

If `encounterSummaries` is empty (character is on the roster but has no AA assignments anywhere), the panel shows a muted, lightly humorous banner in place of the summary line. Something like: _"No assignments detected. Show up, stay alive, and maybe they'll notice. GLHF."_

## Data Shape

```typescript
interface CharacterEncounterSummary {
  encounterId: string | "default";
  encounterName: string; // "Default/Trash" or the encounter's encounterName
  slotNames: string[]; // slot names the character is assigned to, for pills
  template: string; // extractCharacterLines(fullTemplate, slotNames).join('\n')
  slotAssignments: AASlotAssignment[]; // filtered to this encounter context (by encounterId or raidPlanId)
}
```

Derived client-side in a `useMemo` in `RaidPlanPublicView`, from existing `plan` data + `userCharacterIds`.

## New Utility: `extractCharacterLines`

Added to `src/lib/aa-template.ts`.

```typescript
export function extractCharacterLines(
  template: string,
  slotNames: string[], // slots this character is assigned to
): string[]; // lines containing at least one of those slots
```

**Logic:**

1. Split `template` by `\n`.
2. Build a set of lowercased slot names.
3. For each line, check if the lowercased line contains `{assign:slotname}` or `{ref:slotname}` for any slot in the set.
4. Return matching lines.

Both `{assign:}` and `{ref:}` tags are checked so that mirrored slot references are captured.

## New Component: `CharacterSummaryPanel`

**File:** `src/components/raid-planner/character-summary-panel.tsx`

**Props:**

```typescript
interface CharacterSummaryPanelProps {
  viewAsCharacter: { name: string; class: string | null };
  encounterSummaries: CharacterEncounterSummary[];
  allCharacters: RaidPlanCharacter[];
  userCharacterIds: number[];
  onEncounterClick: (encounterId: string) => void; // switches active tab in parent
}
```

**Internal state:** `const [showDetails, setShowDetails] = useState(true)`

**Rendering:**

- GLHF banner when `encounterSummaries.length === 0`.
- Otherwise: summary line + toggle + collapsible details section.
- Each encounter block uses `AATemplateRenderer` with `template = summary.template` (the extracted lines joined by `\n`), `slotAssignments = summary.slotAssignments`, `readOnly`, `hideUnassigned`, `skipDndContext`, `userCharacterIds`. The `encounterId` / `raidPlanId` prop is set based on whether `summary.encounterId` is `"default"` or an encounter UUID.

## Integration

In `raid-plan-public-view.tsx`:

1. Add a `useMemo` for `encounterSummaries` (derived from `assignmentLabelsMap`, `plan.encounters`, `plan.defaultAATemplate`, `plan.aaSlotAssignments`).
2. Render `<CharacterSummaryPanel>` between `<Separator>` and `<Tabs>`, gated on `viewAsCharacterId !== null && !!viewAsCharacter`.

## Edge Cases

| Case                                                  | Behavior                                                         |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| Character has no AA assignments anywhere              | GLHF banner                                                      |
| Default/Trash has assignments                         | Included as first entry labeled "Default/Trash"                  |
| Encounter has AA enabled but character isn't assigned | Encounter not listed                                             |
| Character assigned via `{ref:}` tag only              | Line is still extracted (ref check in `extractCharacterLines`)   |
| Character is an alt mapped to a primary               | `userCharacterIds` includes alt IDs — existing logic covers this |
| Encounter AA is disabled (`useCustomAA = false`)      | `encounter.aaTemplate` is null — no entry for that encounter     |
| Plan-level AA is disabled (`useDefaultAA = false`)    | `plan.defaultAATemplate` ignored — no Default/Trash entry        |

## Files Changed

| File                                                      | Change                                       |
| --------------------------------------------------------- | -------------------------------------------- |
| `src/lib/aa-template.ts`                                  | Add `extractCharacterLines()` export         |
| `src/components/raid-planner/character-summary-panel.tsx` | New component                                |
| `src/components/raid-planner/raid-plan-public-view.tsx`   | Add `encounterSummaries` memo + render panel |
