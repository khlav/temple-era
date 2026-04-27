# Character Assignment Summary Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a character-specific assignment summary panel to the public raid plan view (`/raid-plans/:id`) that appears when a "View as" character is selected, showing their AA assignments across all encounters at a glance.

**Architecture:** A new pure utility `extractCharacterLines` is added to `src/lib/aa-template.ts` — it splits a template by newlines and returns only lines containing the character's assigned slots. A new `CharacterSummaryPanel` component renders a summary sentence and a collapsible responsive grid of per-encounter AA blocks, reusing `AATemplateRenderer` for rendering. `RaidPlanPublicView` derives `CharacterEncounterSummary[]` via a `useMemo` from already-fetched plan data and wires `onEncounterClick` to `setActiveTab`. No new API calls or server changes.

**Tech Stack:** React, Tailwind CSS, shadcn/ui components, Vitest (new, for unit tests on the utility function)

---

## File Map

| File                                                      | Action | Responsibility                                                  |
| --------------------------------------------------------- | ------ | --------------------------------------------------------------- |
| `src/lib/aa-template.ts`                                  | Modify | Add `extractCharacterLines` export                              |
| `src/lib/__tests__/aa-template.test.ts`                   | Create | Unit tests for `extractCharacterLines`                          |
| `src/components/raid-planner/character-summary-panel.tsx` | Create | Summary panel component + `CharacterEncounterSummary` interface |
| `src/components/raid-planner/raid-plan-public-view.tsx`   | Modify | `encounterSummaries` memo + render panel                        |
| `vitest.config.ts`                                        | Create | Vitest configuration                                            |
| `package.json`                                            | Modify | Add `test` and `test:watch` scripts                             |

---

## Task 0: Set up Vitest

**Files:**

- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest and path-alias plugin**

```bash
pnpm add -D vitest vite-tsconfig-paths
```

Expected: packages added to `devDependencies` in `package.json`.

- [ ] **Step 2: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

In the `"scripts"` block, add after the existing scripts:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Verify Vitest runs**

```bash
pnpm test
```

Expected output: `No test files found` (or similar — no failures, just no tests yet).

- [ ] **Step 5: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore(test): add vitest for unit tests"
```

---

## Task 1: Add `extractCharacterLines` utility (TDD)

**Files:**

- Create: `src/lib/__tests__/aa-template.test.ts`
- Modify: `src/lib/aa-template.ts`

- [ ] **Step 1: Create the test file with failing tests**

Create `src/lib/__tests__/aa-template.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { extractCharacterLines } from "../aa-template";

describe("extractCharacterLines", () => {
  it("returns lines containing {assign:SlotName}", () => {
    const template = "Line 1\n{skull} Tank: {assign:MainTank}\nLine 3";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "{skull} Tank: {assign:MainTank}",
    ]);
  });

  it("returns lines containing {ref:SlotName}", () => {
    const template =
      "{assign:MainTank} Rend\nRef line: {ref:MainTank}\nOther line";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "{assign:MainTank} Rend",
      "Ref line: {ref:MainTank}",
    ]);
  });

  it("matches case-insensitively", () => {
    const template = "Tank: {assign:MAINTANK}";
    expect(extractCharacterLines(template, ["maintank"])).toEqual([
      "Tank: {assign:MAINTANK}",
    ]);
  });

  it("matches slots with modifiers like {assign:SlotName:4}", () => {
    const template = "Tank: {assign:MainTank:4:nocolor}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "Tank: {assign:MainTank:4:nocolor}",
    ]);
  });

  it("matches slots with ref modifier {ref:SlotName:nocolor}", () => {
    const template = "Ref: {ref:MainTank:nocolor}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "Ref: {ref:MainTank:nocolor}",
    ]);
  });

  it("returns empty array when template is empty", () => {
    expect(extractCharacterLines("", ["MainTank"])).toEqual([]);
  });

  it("returns empty array when slotNames is empty", () => {
    expect(extractCharacterLines("Tank: {assign:MainTank}", [])).toEqual([]);
  });

  it("only returns lines containing the specified slots", () => {
    const template = "MT: {assign:MainTank}\nOT: {assign:OffTank}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "MT: {assign:MainTank}",
    ]);
  });

  it("returns a line containing any of multiple specified slots", () => {
    const template =
      "{assign:MainTank} and {assign:OffTank} on same line\nUnrelated line";
    expect(extractCharacterLines(template, ["MainTank", "OffTank"])).toEqual([
      "{assign:MainTank} and {assign:OffTank} on same line",
    ]);
  });

  it("does not return lines with similar but non-matching slot names", () => {
    const template = "MT: {assign:MainTankBackup}\nOT: {assign:MainTank}";
    expect(extractCharacterLines(template, ["MainTank"])).toEqual([
      "OT: {assign:MainTank}",
    ]);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test
```

Expected: all tests in `aa-template.test.ts` fail with `extractCharacterLines is not a function` or similar.

- [ ] **Step 3: Add `extractCharacterLines` to `src/lib/aa-template.ts`**

Append the following export after the existing `getSlotDefinitions` function at the bottom of the file:

```typescript
/**
 * Extract template lines that contain an {assign:} or {ref:} tag for any of
 * the given slot names. Used to build the per-character assignment summary.
 */
export function extractCharacterLines(
  template: string,
  slotNames: string[],
): string[] {
  if (!template || slotNames.length === 0) return [];

  const lowerNames = slotNames.map((n) => n.toLowerCase());

  return template.split("\n").filter((line) => {
    const lower = line.toLowerCase();
    return lowerNames.some(
      (name) =>
        lower.includes(`{assign:${name}}`) ||
        lower.includes(`{assign:${name}:`) ||
        lower.includes(`{ref:${name}}`) ||
        lower.includes(`{ref:${name}:`),
    );
  });
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
pnpm test
```

Expected: all 10 tests in `aa-template.test.ts` pass. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aa-template.ts src/lib/__tests__/aa-template.test.ts
git commit -m "feat(raid-plan): add extractCharacterLines utility"
```

---

## Task 2: Create `CharacterSummaryPanel` component

**Files:**

- Create: `src/components/raid-planner/character-summary-panel.tsx`

- [ ] **Step 1: Create the component file**

Create `src/components/raid-planner/character-summary-panel.tsx`:

```typescript
"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import { ClassIcon } from "~/components/ui/class-icon";
import { AA_CLASS_COLORS } from "~/lib/aa-formatting";
import { AATemplateRenderer } from "./aa-template-renderer";
import type { RaidPlanCharacter, AASlotAssignment } from "./types";

export interface CharacterEncounterSummary {
  encounterId: string | "default";
  encounterName: string;
  slotNames: string[];
  /** extractCharacterLines(fullTemplate, slotNames).join('\n') */
  template: string;
  /** Assignments filtered to this encounter context */
  slotAssignments: AASlotAssignment[];
  /** planId when encounterId === "default"; encounter UUID otherwise */
  contextId: string;
}

interface CharacterSummaryPanelProps {
  viewAsCharacter: { name: string; class: string | null };
  encounterSummaries: CharacterEncounterSummary[];
  allCharacters: RaidPlanCharacter[];
  userCharacterIds: number[];
  onEncounterClick: (encounterId: string) => void;
}

export function CharacterSummaryPanel({
  viewAsCharacter,
  encounterSummaries,
  allCharacters,
  userCharacterIds,
  onEncounterClick,
}: CharacterSummaryPanelProps) {
  const [showDetails, setShowDetails] = useState(true);

  const classColor = viewAsCharacter.class
    ? (AA_CLASS_COLORS[
        viewAsCharacter.class.toLowerCase().replace(/\s+/g, "")
      ] ?? undefined)
    : undefined;

  const summaryEncounters = encounterSummaries.slice(0, 3);
  const remainingCount = encounterSummaries.length - 3;

  return (
    <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card">
      {/* Summary line */}
      <div className="flex items-start justify-between gap-3 p-3">
        {encounterSummaries.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">
            No assignments found for{" "}
            <span className="font-semibold">{viewAsCharacter.name}</span> —
            show up, stay alive, and try not to stand in the bad. GLHF.
          </p>
        ) : (
          <p className="flex-1 text-sm leading-relaxed">
            {viewAsCharacter.class && (
              <ClassIcon
                characterClass={viewAsCharacter.class}
                px={16}
                className="mr-1 inline-block align-middle"
              />
            )}
            <span
              className="font-bold"
              style={classColor ? { color: classColor } : undefined}
            >
              {viewAsCharacter.name}
            </span>{" "}
            has assignments in{" "}
            {summaryEncounters.map((s, i) => (
              <span key={s.encounterId}>
                <span className="font-semibold text-foreground">
                  {s.encounterName}
                </span>{" "}
                (
                {s.slotNames.map((name, j) => (
                  <span key={name}>
                    <span className="inline-block rounded border border-purple-500/25 bg-purple-500/10 px-1 text-xs font-medium text-purple-300">
                      {name}
                    </span>
                    {j < s.slotNames.length - 1 ? " " : ""}
                  </span>
                ))}
                ){i < summaryEncounters.length - 1 ? ", " : ""}
              </span>
            ))}
            {remainingCount > 0 &&
              `, and ${remainingCount} more encounter${remainingCount !== 1 ? "s" : ""}.`}
          </p>
        )}
        {encounterSummaries.length > 0 && (
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:border-muted-foreground hover:text-foreground"
          >
            {showDetails ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            {showDetails ? "Hide details" : "Show details"}
          </button>
        )}
      </div>

      {/* Encounter grid */}
      {showDetails && encounterSummaries.length > 0 && (
        <div className="border-t border-border p-3">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-3">
            {encounterSummaries.map((summary) => (
              <div
                key={summary.encounterId}
                onClick={() => onEncounterClick(summary.encounterId)}
                className="cursor-pointer overflow-hidden rounded-md border border-border bg-muted/30 transition-colors hover:border-muted-foreground/50 hover:bg-muted/50"
              >
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  <div className="h-3 w-0.5 shrink-0 rounded-full bg-purple-400" />
                  <span className="flex-1 truncate text-xs font-semibold text-foreground">
                    {summary.encounterName}
                  </span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                </div>
                <div className="p-2">
                  <AATemplateRenderer
                    template={summary.template}
                    encounterId={
                      summary.encounterId !== "default"
                        ? summary.contextId
                        : undefined
                    }
                    raidPlanId={
                      summary.encounterId === "default"
                        ? summary.contextId
                        : undefined
                    }
                    characters={allCharacters}
                    slotAssignments={summary.slotAssignments}
                    readOnly
                    hideUnassigned
                    skipDndContext
                    userCharacterIds={userCharacterIds}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

```bash
pnpm typecheck
```

Expected: no errors in `character-summary-panel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/raid-planner/character-summary-panel.tsx
git commit -m "feat(raid-plan): add CharacterSummaryPanel component"
```

---

## Task 3: Wire up integration in `RaidPlanPublicView`

**Files:**

- Modify: `src/components/raid-planner/raid-plan-public-view.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/raid-planner/raid-plan-public-view.tsx`, add these two imports alongside the existing ones:

```typescript
import { extractCharacterLines } from "~/lib/aa-template";
import {
  CharacterSummaryPanel,
  type CharacterEncounterSummary,
} from "./character-summary-panel";
```

- [ ] **Step 2: Add the `encounterSummaries` memo**

In `RaidPlanPublicView`, add this `useMemo` directly after the existing `assignmentLabelsMap` memo (around line 145):

```typescript
const encounterSummaries = useMemo((): CharacterEncounterSummary[] => {
  if (!plan || assignmentLabelsMap.size === 0) return [];

  const summaries: CharacterEncounterSummary[] = [];

  // Default/Trash
  const defaultSlotNames = assignmentLabelsMap.get("default");
  if (defaultSlotNames?.length && plan.useDefaultAA && plan.defaultAATemplate) {
    const lines = extractCharacterLines(
      plan.defaultAATemplate,
      defaultSlotNames,
    );
    if (lines.length > 0) {
      summaries.push({
        encounterId: "default",
        encounterName: "Default/Trash",
        slotNames: defaultSlotNames,
        template: lines.join("\n"),
        slotAssignments: plan.aaSlotAssignments.filter(
          (a) => a.raidPlanId === planId && a.encounterId === null,
        ),
        contextId: planId,
      });
    }
  }

  // Encounter-specific (sorted by sortOrder)
  const sortedEncounters = [...plan.encounters].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  for (const encounter of sortedEncounters) {
    const slotNames = assignmentLabelsMap.get(encounter.id);
    if (!slotNames?.length || !encounter.useCustomAA || !encounter.aaTemplate)
      continue;

    const lines = extractCharacterLines(encounter.aaTemplate, slotNames);
    if (lines.length === 0) continue;

    summaries.push({
      encounterId: encounter.id,
      encounterName: encounter.encounterName,
      slotNames,
      template: lines.join("\n"),
      slotAssignments: plan.aaSlotAssignments.filter(
        (a) => a.encounterId === encounter.id,
      ),
      contextId: encounter.id,
    });
  }

  return summaries;
}, [plan, planId, assignmentLabelsMap]);
```

- [ ] **Step 3: Render the panel**

In the JSX of `RaidPlanPublicView`, locate the `<Separator className="my-2" />` line (around line 288). Insert the panel immediately after it, before `<Tabs ...>`:

```tsx
<Separator className="my-2" />

{viewAsCharacterId !== null && viewAsCharacter && (
  <CharacterSummaryPanel
    viewAsCharacter={viewAsCharacter}
    encounterSummaries={encounterSummaries}
    allCharacters={plan.characters as RaidPlanCharacter[]}
    userCharacterIds={userCharacterIds}
    onEncounterClick={setActiveTab}
  />
)}

<Tabs value={activeTab} onValueChange={setActiveTab}>
```

- [ ] **Step 4: Type-check the full file**

```bash
pnpm typecheck
```

Expected: no errors. If `viewAsCharacter.class` causes a type mismatch on `ClassIcon` (which expects `string` not `string | null`), the null guard inside `CharacterSummaryPanel` already handles this — no change needed in the public view.

- [ ] **Step 5: Commit**

```bash
git add src/components/raid-planner/raid-plan-public-view.tsx
git commit -m "feat(raid-plan): wire up character assignment summary panel"
```

---

## Task 4: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Open a public raid plan that has AA templates configured**

Navigate to `/raid-plans/<any-public-plan-id>`. You can find one via `/raid-plans`.

- [ ] **Step 3: Verify the panel does NOT appear before selecting a character**

The area between the separator and the encounter tabs should be empty.

- [ ] **Step 4: Select a character using the "View as" selector**

Pick a character that has AA assignments in at least one encounter. The panel should appear below the separator showing the summary sentence with class icon, class-colored name, encounter names, and role pills.

- [ ] **Step 5: Verify the summary line truncation**

If the character has assignments in more than 3 encounters, only 3 encounter names appear inline and "and N more encounters." appears at the end.

- [ ] **Step 6: Verify the details grid**

The details section should show a responsive grid of encounter blocks (3-col on wide screens). Each block has the encounter name header with a purple accent bar and the extracted AA lines with the character's name highlighted.

- [ ] **Step 7: Verify clicking an encounter block switches the active tab**

Click an encounter block in the summary. The encounter sidebar and main AA/groups view below should switch to that encounter.

- [ ] **Step 8: Verify Hide/Show details toggle**

Click "Hide details" — the grid collapses. Click "Show details" — it expands.

- [ ] **Step 9: Verify the GLHF state**

Select a character who is on the roster but has no AA assignments anywhere. The panel should show the "No assignments" italic message instead of the summary sentence and grid.

- [ ] **Step 10: Run full checks and final commit**

```bash
pnpm check
```

Expected: no lint or type errors. If any formatting issues, run `pnpm format:write` first.

```bash
git add -A
git commit -m "feat(raid-plan): character assignment summary panel"
```
