# External REST API — Stage 3b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add write endpoints to the external REST API enabling full automation of the Sunday-night raid planning workflow: create a plan, sync signups, bulk-assign groups, update encounters, and assign AA slots.

**Architecture:** Each endpoint is a Next.js App Router route handler under `src/app/api/v1/raid-plans/`. Complex signup→character reconciliation is extracted into a shared helper (`src/server/api/helpers/match-signups.ts`) so the REST endpoint and the existing tRPC procedure share the same logic without duplication. All handlers follow the existing `validateApiToken` + `isRaidManager` guard pattern.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, `@asteasolutions/zod-to-openapi`, Raid Helper external API, TypeScript strict mode.

---

## File Map

| File                                                                      | Action | Purpose                                                     |
| ------------------------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `src/server/api/helpers/match-signups.ts`                                 | Create | Shared signup→character reconciliation                      |
| `src/server/api/routers/raid-helper.ts`                                   | Modify | Import from helper instead of local defs                    |
| `src/app/api/v1/raid-plans/[id]/route.ts`                                 | Modify | Add `availableSlots` to plan + encounter responses          |
| `src/app/api/v1/raid-plans/route.ts`                                      | Modify | Add POST handler                                            |
| `src/app/api/v1/raid-plans/[id]/sync-signups/route.ts`                    | Create | POST — fetch + reconcile Raid Helper signups                |
| `src/app/api/v1/raid-plans/[id]/roster/route.ts`                          | Create | PUT — bulk default group/position patch                     |
| `src/app/api/v1/raid-plans/[id]/roster/[planCharacterId]/route.ts`        | Create | PATCH — re-link one slot to a DB character                  |
| `src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/route.ts`        | Create | PUT — encounter settings                                    |
| `src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/roster/route.ts` | Create | PUT — bulk per-encounter assignments                        |
| `src/app/api/v1/raid-plans/[id]/aa-slots/route.ts`                        | Create | PUT — bulk AA slot merge                                    |
| `src/lib/openapi-registry.ts`                                             | Modify | Add schemas + register 7 new paths + update GET plan detail |

---

## Task 1: Extract match-signups helper

**Files:**

- Create: `src/server/api/helpers/match-signups.ts`
- Modify: `src/server/api/routers/raid-helper.ts` (lines 228–1122)

The `matchSignupsToCharacters` tRPC procedure has all its logic inline. Extract it into a standalone async function that accepts a Drizzle db client directly, making it callable from the REST route (which has no tRPC context).

- [ ] **Step 1: Create `src/server/api/helpers/match-signups.ts`**

```ts
import { eq, inArray, and, isNotNull } from "drizzle-orm";
import { characters, users, accounts } from "~/server/db/schema";
import { type db as database } from "~/server/db";

// ─── Constants ────────────────────────────────────────────────────────────────

const WOW_CLASSES = new Set([
  "druid",
  "hunter",
  "mage",
  "paladin",
  "priest",
  "rogue",
  "shaman",
  "warlock",
  "warrior",
]);

const SKIP_CLASS_NAMES = new Set([
  "bench",
  "tentative",
  "absent",
  "absence",
  "late",
]);

const TANK_SPEC_TO_CLASS: Record<string, string> = {
  guardian: "Druid",
  protection: "Warrior",
};

const LOW_SIGNAL_SIGNUP_TOKENS = new Set([
  "all",
  "alt",
  "alts",
  "bench",
  "forms",
  "late",
  "tentative",
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type MatchStatus = "matched" | "ambiguous" | "unmatched" | "skipped";

export interface MatchedCharacter {
  characterId: number;
  characterName: string;
  characterServer: string;
  characterClass: string;
  primaryCharacterId: number | null;
  primaryCharacterName: string | null;
}

export interface SignupMatchResult {
  userId: string;
  discordName: string;
  className: string;
  specName: string;
  partyId: number | null;
  slotId: number | null;
  status: MatchStatus;
  matchSource?:
    | "saved_override"
    | "discord_link"
    | "token_exact"
    | "token_prefix"
    | "token_substring"
    | "manual_review"
    | "skipped";
  confidence?: number;
  explanation?: string;
  needsManagerReview?: boolean;
  matchedPrimaryCharacterId?: number | null;
  matchedPrimaryCharacterName?: string | null;
  matchedCharacter?: MatchedCharacter;
  candidates?: MatchedCharacter[];
}

export type MatchSource = NonNullable<SignupMatchResult["matchSource"]>;

type CharacterMatch = {
  characterId: number;
  name: string;
  server: string;
  class: string;
  primaryCharacterId: number | null;
};

type LinkedDiscordFamily = {
  discordUserId: string;
  familyId: number;
  anchorCharacterId: number;
  anchorCharacterName: string;
};

export type SignupInput = {
  userId: string;
  discordName: string;
  className: string;
  specName?: string;
  partyId?: number | null;
  slotId?: number | null;
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function resolveClassName(
  className: string,
  specName?: string,
): string | null {
  const lc = className.toLowerCase();
  if (SKIP_CLASS_NAMES.has(lc)) return null;
  if (WOW_CLASSES.has(lc)) return lc.charAt(0).toUpperCase() + lc.slice(1);
  if (lc === "tank" && specName)
    return TANK_SPEC_TO_CLASS[specName.toLowerCase()] ?? null;
  return null;
}

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function extractNormalizedTokens(name: string): string[] {
  const matches = name.match(/\p{L}{3,}/gu) ?? [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const normalized = normalizeName(match);
    if (
      normalized.length < 3 ||
      LOW_SIGNAL_SIGNUP_TOKENS.has(normalized) ||
      seen.has(normalized)
    )
      continue;
    seen.add(normalized);
    tokens.push(normalized);
  }
  return tokens;
}

function getEffectivePrimaryId(character: CharacterMatch): number {
  return character.primaryCharacterId ?? character.characterId;
}

function toMatchedCharacter(
  character: CharacterMatch,
  primaryCharacter: CharacterMatch | undefined,
): MatchedCharacter {
  return {
    characterId: character.characterId,
    characterName: character.name,
    characterServer: character.server,
    characterClass: character.class,
    primaryCharacterId: character.primaryCharacterId,
    primaryCharacterName: primaryCharacter?.name ?? null,
  };
}

function getOverrideMatches(): Map<string, number> {
  return new Map();
}

function chooseFamilyCharacterByClass(
  family: CharacterMatch[],
  resolvedClass: string | null,
): {
  type: "matched" | "ambiguous" | "missing_class_match";
  matches: CharacterMatch[];
} {
  if (!resolvedClass) return { type: "missing_class_match", matches: [] };
  const classMatches = family.filter(
    (m) => m.class.toLowerCase() === resolvedClass.toLowerCase(),
  );
  if (classMatches.length === 1)
    return { type: "matched", matches: classMatches };
  if (classMatches.length > 1)
    return { type: "ambiguous", matches: classMatches };
  return { type: "missing_class_match", matches: [] };
}

function compareFamilyScores(
  a: { score: number; familyId: number },
  b: { score: number; familyId: number },
): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.familyId - b.familyId;
}

// ─── Main matching function ───────────────────────────────────────────────────

type DbClient = Pick<typeof database, "select">;

export async function matchSignupsToCharacters(
  db: DbClient,
  signups: SignupInput[],
): Promise<SignupMatchResult[]> {
  const signupsWithResolved = signups.map((signup) => {
    const cleanedSpecName = signup.specName?.replace(/[0-9]/g, "") ?? "";
    return {
      ...signup,
      specName: cleanedSpecName,
      resolvedClass: resolveClassName(signup.className, cleanedSpecName),
      normalizedDiscordName: normalizeName(signup.discordName),
      tokens: extractNormalizedTokens(signup.discordName),
    };
  });

  const allCharacters = await db
    .select({
      characterId: characters.characterId,
      name: characters.name,
      server: characters.server,
      class: characters.class,
      primaryCharacterId: characters.primaryCharacterId,
    })
    .from(characters)
    .where(eq(characters.isIgnored, false));

  const allCharactersById = new Map(
    allCharacters.map((c) => [c.characterId, c]),
  );
  const familyMap = new Map<number, CharacterMatch[]>();
  const normalizedNameMap = new Map<number, string>();

  for (const character of allCharacters) {
    const familyId = getEffectivePrimaryId(character);
    normalizedNameMap.set(character.characterId, normalizeName(character.name));
    if (!familyMap.has(familyId)) familyMap.set(familyId, []);
    familyMap.get(familyId)!.push(character);
  }

  const userIds = [
    ...new Set(signupsWithResolved.map((s) => s.userId).filter(Boolean)),
  ];

  const linkedDiscordRows =
    userIds.length === 0
      ? []
      : await db
          .select({
            discordUserId: accounts.providerAccountId,
            characterId: users.characterId,
            anchorCharacterId: characters.characterId,
            anchorCharacterName: characters.name,
            primaryCharacterId: characters.primaryCharacterId,
          })
          .from(accounts)
          .innerJoin(users, eq(accounts.userId, users.id))
          .leftJoin(characters, eq(users.characterId, characters.characterId))
          .where(
            and(
              eq(accounts.provider, "discord"),
              inArray(accounts.providerAccountId, userIds),
              isNotNull(users.characterId),
            ),
          );

  const linkedFamiliesByUserId = new Map<string, LinkedDiscordFamily[]>();
  for (const row of linkedDiscordRows) {
    if (!row.characterId || !row.anchorCharacterId || !row.anchorCharacterName)
      continue;
    const anchorCharacter =
      allCharactersById.get(row.anchorCharacterId) ??
      allCharactersById.get(row.characterId);
    if (!anchorCharacter) continue;
    const familyId = getEffectivePrimaryId(anchorCharacter);
    if (!linkedFamiliesByUserId.has(row.discordUserId))
      linkedFamiliesByUserId.set(row.discordUserId, []);
    const existing = linkedFamiliesByUserId.get(row.discordUserId)!;
    if (!existing.some((f) => f.familyId === familyId)) {
      existing.push({
        discordUserId: row.discordUserId,
        familyId,
        anchorCharacterId: anchorCharacter.characterId,
        anchorCharacterName: anchorCharacter.name,
      });
    }
  }

  const overrideMatches = getOverrideMatches();
  const results: SignupMatchResult[] = [];

  for (const signup of signupsWithResolved) {
    const baseResult = {
      userId: signup.userId,
      discordName: signup.discordName,
      className: signup.className,
      specName: signup.specName,
      partyId: signup.partyId ?? null,
      slotId: signup.slotId ?? null,
    };

    const overrideFamilyId = overrideMatches.get(
      `${signup.userId}:${signup.normalizedDiscordName}`,
    );

    const resolveFamily = (
      familyId: number,
      source: MatchSource,
      confidence: number,
      explanation: string,
    ): SignupMatchResult => {
      const family = familyMap.get(familyId) ?? [];
      const primaryCharacter = allCharactersById.get(familyId);

      if (!signup.resolvedClass) {
        if (primaryCharacter) {
          return {
            ...baseResult,
            status: "skipped",
            matchSource: source === "saved_override" ? source : "skipped",
            confidence,
            explanation,
            needsManagerReview: false,
            matchedPrimaryCharacterId: primaryCharacter.characterId,
            matchedPrimaryCharacterName: primaryCharacter.name,
            matchedCharacter: toMatchedCharacter(
              primaryCharacter,
              primaryCharacter,
            ),
          };
        }
        return {
          ...baseResult,
          status: "skipped",
          matchSource: "skipped",
          confidence,
          explanation,
          needsManagerReview: false,
        };
      }

      const familyChoice = chooseFamilyCharacterByClass(
        family,
        signup.resolvedClass,
      );

      if (familyChoice.type === "matched") {
        const selected = familyChoice.matches[0]!;
        return {
          ...baseResult,
          status: "matched",
          matchSource: source,
          confidence,
          explanation,
          needsManagerReview: false,
          matchedPrimaryCharacterId: familyId,
          matchedPrimaryCharacterName: primaryCharacter?.name ?? null,
          matchedCharacter: toMatchedCharacter(selected, primaryCharacter),
        };
      }

      if (familyChoice.type === "ambiguous") {
        return {
          ...baseResult,
          status: "ambiguous",
          matchSource: source,
          confidence,
          explanation: `${explanation} Family found, but ${familyChoice.matches.length} ${signup.resolvedClass} characters remain.`,
          needsManagerReview: true,
          matchedPrimaryCharacterId: familyId,
          matchedPrimaryCharacterName: primaryCharacter?.name ?? null,
          candidates: familyChoice.matches.map((m) =>
            toMatchedCharacter(m, primaryCharacter),
          ),
        };
      }

      return {
        ...baseResult,
        status: signup.resolvedClass ? "unmatched" : "skipped",
        matchSource: source,
        confidence,
        explanation: `${explanation} Family found, but no ${signup.resolvedClass} character matched.`,
        needsManagerReview: true,
        matchedPrimaryCharacterId: familyId,
        matchedPrimaryCharacterName: primaryCharacter?.name ?? null,
        candidates: family
          .slice(0, 6)
          .map((m) => toMatchedCharacter(m, primaryCharacter)),
      };
    };

    if (overrideFamilyId && familyMap.has(overrideFamilyId)) {
      results.push(
        resolveFamily(
          overrideFamilyId,
          "saved_override",
          1,
          "Saved manager override matched this signup.",
        ),
      );
      continue;
    }

    const linkedFamilies = linkedFamiliesByUserId.get(signup.userId) ?? [];
    const uniqueLinkedFamilyIds = [
      ...new Set(linkedFamilies.map((f) => f.familyId)),
    ];

    if (uniqueLinkedFamilyIds.length === 1) {
      results.push(
        resolveFamily(
          uniqueLinkedFamilyIds[0]!,
          "discord_link",
          0.99,
          "Discord account link identified this family.",
        ),
      );
      continue;
    }

    const familyScores = new Map<
      number,
      {
        score: number;
        source: MatchSource;
        exactTokens: string[];
        prefixTokens: string[];
        substringTokens: string[];
      }
    >();

    const applyScore = (
      familyId: number,
      source: MatchSource,
      score: number,
      token: string,
    ) => {
      const existing = familyScores.get(familyId) ?? {
        score: 0,
        source,
        exactTokens: [],
        prefixTokens: [],
        substringTokens: [],
      };
      existing.score += score;
      if (source === "token_exact" && !existing.exactTokens.includes(token))
        existing.exactTokens.push(token);
      if (source === "token_prefix" && !existing.prefixTokens.includes(token))
        existing.prefixTokens.push(token);
      if (
        source === "token_substring" &&
        !existing.substringTokens.includes(token)
      )
        existing.substringTokens.push(token);
      if (
        source === "token_exact" ||
        (source === "token_prefix" && existing.source !== "token_exact") ||
        (source === "token_substring" &&
          existing.source !== "token_exact" &&
          existing.source !== "token_prefix")
      ) {
        existing.source = source;
      }
      familyScores.set(familyId, existing);
    };

    for (const token of signup.tokens) {
      for (const character of allCharacters) {
        const normalizedCharacterName =
          normalizedNameMap.get(character.characterId) ?? "";
        const familyId = getEffectivePrimaryId(character);
        if (normalizedCharacterName === token) {
          applyScore(familyId, "token_exact", 120, token);
          continue;
        }
        if (normalizedCharacterName.startsWith(token)) {
          applyScore(familyId, "token_prefix", 80, token);
          continue;
        }
        if (
          token.length >= 4 &&
          normalizedCharacterName.includes(token) &&
          !signup.discordName.includes(" ")
        ) {
          applyScore(familyId, "token_substring", 30, token);
        }
      }
    }

    const rankedFamilies = Array.from(familyScores.entries())
      .map(([familyId, meta]) => ({
        familyId,
        score: meta.score,
        source: meta.source,
        meta,
      }))
      .sort(compareFamilyScores);

    if (rankedFamilies.length === 0) {
      results.push({
        ...baseResult,
        status: signup.resolvedClass ? "unmatched" : "skipped",
        matchSource: signup.resolvedClass ? "manual_review" : "skipped",
        confidence: 0,
        explanation: "No strong token or family match was found.",
        needsManagerReview: !!signup.resolvedClass,
      });
      continue;
    }

    const topFamily = rankedFamilies[0]!;
    const secondFamily = rankedFamilies[1];

    if (
      secondFamily &&
      topFamily.score - secondFamily.score < 25 &&
      topFamily.score < 150
    ) {
      const topCandidates = rankedFamilies.slice(0, 4).flatMap((entry) => {
        const family = familyMap.get(entry.familyId) ?? [];
        const primaryCharacter = allCharactersById.get(entry.familyId);
        const familyChoice = chooseFamilyCharacterByClass(
          family,
          signup.resolvedClass,
        );
        if (
          familyChoice.type === "matched" ||
          familyChoice.type === "ambiguous"
        ) {
          return familyChoice.matches.map((m) =>
            toMatchedCharacter(m, primaryCharacter),
          );
        }
        return family
          .slice(0, 2)
          .map((m) => toMatchedCharacter(m, primaryCharacter));
      });

      results.push({
        ...baseResult,
        status: signup.resolvedClass ? "ambiguous" : "skipped",
        matchSource: topFamily.source,
        confidence: topFamily.score / 200,
        explanation:
          "Multiple families scored similarly, so this signup needs manager review.",
        needsManagerReview: !!signup.resolvedClass,
        candidates: topCandidates.slice(0, 6),
      });
      continue;
    }

    const explanationParts: string[] = [];
    if (topFamily.meta.exactTokens.length > 0) {
      explanationParts.push(
        `Exact token ${topFamily.meta.exactTokens.map((t) => `'${t}'`).join(", ")} identified this family.`,
      );
    } else if (topFamily.meta.prefixTokens.length > 0) {
      explanationParts.push(
        `Prefix token ${topFamily.meta.prefixTokens.map((t) => `'${t}'`).join(", ")} identified this family.`,
      );
    } else if (topFamily.meta.substringTokens.length > 0) {
      explanationParts.push(
        `Substring token ${topFamily.meta.substringTokens.map((t) => `'${t}'`).join(", ")} identified this family.`,
      );
    }

    const confidence =
      topFamily.source === "token_exact"
        ? 0.92
        : topFamily.source === "token_prefix"
          ? 0.78
          : 0.62;

    results.push(
      resolveFamily(
        topFamily.familyId,
        topFamily.source,
        confidence,
        explanationParts[0] ??
          "Name tokens identified a likely family for this signup.",
      ),
    );
  }

  return results;
}
```

- [ ] **Step 2: Update `src/server/api/routers/raid-helper.ts` — replace local definitions with imports**

At the top of the file, add imports and remove the local definitions that are now in the helper. Find these local definitions (lines ~228–375 in raid-helper.ts) and delete them, replacing with an import block. The definitions to remove are:

- `LOW_SIGNAL_SIGNUP_TOKENS` (Set)
- `MatchStatus`, `MatchedCharacter`, `SignupMatchResult` (types/interfaces)
- `MatchSource` (type)
- `CharacterMatch`, `LinkedDiscordFamily` (local types)
- `normalizeName`, `extractNormalizedTokens`, `getEffectivePrimaryId`, `toMatchedCharacter`, `getOverrideMatches`, `chooseFamilyCharacterByClass`, `compareFamilyScores` (functions)

Add this import at the top of `raid-helper.ts` (after the existing imports):

```ts
import {
  type MatchStatus,
  type MatchedCharacter,
  type SignupMatchResult,
  type MatchSource,
  type SignupInput,
  resolveClassName,
  normalizeName,
  extractNormalizedTokens,
  matchSignupsToCharacters as matchSignupsToCharactersHelper,
} from "~/server/api/helpers/match-signups";
```

Then update the `matchSignupsToCharacters` tRPC procedure body to delegate to the helper. Replace the entire body of the procedure (from `async ({ ctx, input }) => {` to the closing `}`) with:

```ts
async ({ ctx, input }) => {
  return matchSignupsToCharactersHelper(ctx.db, input.signups);
},
```

Also remove the `WOW_CLASSES`, `SKIP_CLASS_NAMES`, `TANK_SPEC_TO_CLASS` constants from raid-helper.ts since `resolveClassName` is now imported. Keep only the ones still used locally (they're used in `getScheduledEvents` for role counts — but `resolveClassName` is now imported so the local copy can be removed; the other constants are only used by `resolveClassName`).

- [ ] **Step 3: Verify typecheck passes**

```bash
cd /Users/kirkhlavka/workspace/repos/temple-raids/temple-raids-t3/.worktrees/feature-external-api
pnpm typecheck
```

Expected: no errors. If errors appear, they will be about missing types or wrong import names — fix them before continuing.

- [ ] **Step 4: Commit**

```bash
git add src/server/api/helpers/match-signups.ts src/server/api/routers/raid-helper.ts
git commit -m "refactor(api): extract signup-to-character matching into shared helper"
```

---

## Task 2: availableSlots on GET /api/v1/raid-plans/:id + OpenAPI

**Files:**

- Modify: `src/app/api/v1/raid-plans/[id]/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Add `availableSlots` to the GET plan detail response**

In `src/app/api/v1/raid-plans/[id]/route.ts`, add the import at the top:

```ts
import { getSlotNames } from "~/lib/aa-template";
```

Then update the return statement (currently around line 158). Change the response object from:

```ts
return NextResponse.json({
  id: p.id,
  name: p.name,
  zoneId: p.zoneId,
  raidHelperEventId: p.raidHelperEventId,
  startAt: p.startAt?.toISOString() ?? null,
  isPublic: p.isPublic,
  defaultAATemplate: p.defaultAATemplate,
  useDefaultAA: p.useDefaultAA,
  lastModifiedAt: new Date(p.lastModifiedAt).toISOString(),
  characters: planCharacters,
  encounterGroups,
  encounters,
  encounterAssignments,
  aaSlotAssignments,
});
```

To:

```ts
return NextResponse.json({
  id: p.id,
  name: p.name,
  zoneId: p.zoneId,
  raidHelperEventId: p.raidHelperEventId,
  startAt: p.startAt?.toISOString() ?? null,
  isPublic: p.isPublic,
  defaultAATemplate: p.defaultAATemplate,
  useDefaultAA: p.useDefaultAA,
  availableSlots: getSlotNames(p.defaultAATemplate ?? ""),
  lastModifiedAt: new Date(p.lastModifiedAt).toISOString(),
  characters: planCharacters,
  encounterGroups,
  encounters: encounters.map((e) => ({
    ...e,
    availableSlots: getSlotNames(e.aaTemplate ?? ""),
  })),
  encounterAssignments,
  aaSlotAssignments,
});
```

- [ ] **Step 2: Update OpenAPI schemas in `src/lib/openapi-registry.ts`**

Find `const EncounterSchema = z.object({` and add `availableSlots` to it:

```ts
const EncounterSchema = z.object({
  id: z.string().uuid().openapi({ example: "encounter-uuid" }),
  encounterKey: z.string().nullable().openapi({ example: "lucifron" }),
  encounterName: z.string().openapi({ example: "Lucifron" }),
  sortOrder: z.number().nullable().openapi({ example: 0 }),
  groupId: z.string().uuid().nullable().openapi({ example: null }),
  useDefaultGroups: z.boolean().nullable().openapi({ example: true }),
  aaTemplate: z.string().nullable().openapi({ example: null }),
  useCustomAA: z.boolean().nullable().openapi({ example: false }),
  availableSlots: z
    .array(z.string())
    .openapi({ example: ["Main Tank", "Tranq 1"] }),
});
```

Find `export const RaidPlanDetailSchema = registry.register(` and add `availableSlots` to the extension:

```ts
export const RaidPlanDetailSchema = registry.register(
  "RaidPlanDetail",
  RaidPlanSummarySchema.extend({
    defaultAATemplate: z.string().nullable().openapi({ example: null }),
    useDefaultAA: z.boolean().nullable().openapi({ example: true }),
    availableSlots: z
      .array(z.string())
      .openapi({ example: ["Main Tank", "Tranq 1"] }),
    characters: z.array(PlanCharacterSchema),
    encounterGroups: z.array(EncounterGroupSchema),
    encounters: z.array(EncounterSchema),
    encounterAssignments: z.array(EncounterAssignmentSchema),
    aaSlotAssignments: z.array(AASlotAssignmentSchema),
  }),
);
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add availableSlots to raid plan detail response"
```

---

## Task 3: POST /api/v1/raid-plans + OpenAPI

**Files:**

- Modify: `src/app/api/v1/raid-plans/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Add POST handler to `src/app/api/v1/raid-plans/route.ts`**

The full file after adding POST:

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanEncounterGroups,
  raidPlanEncounters,
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { desc, eq, and, sql, max } from "drizzle-orm";
import { CUSTOM_ZONE_ID } from "~/lib/raid-zones";
import { z } from "zod";

const CreatePlanSchema = z.object({
  raidHelperEventId: z.string().min(1),
  name: z.string().min(1).max(256),
  zoneId: z.string().min(1).max(64),
  startAt: z.string().datetime().optional(),
  cloneFromPlanId: z.string().uuid().optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = Number(searchParams.get("limit") ?? "20");
    const limit = Math.min(50, Math.max(1, isNaN(rawLimit) ? 20 : rawLimit));

    const plans = await db
      .select({
        id: raidPlans.id,
        name: raidPlans.name,
        zoneId: raidPlans.zoneId,
        raidHelperEventId: raidPlans.raidHelperEventId,
        startAt: raidPlans.startAt,
        isPublic: raidPlans.isPublic,
        lastModifiedAt: sql<Date>`COALESCE(${raidPlans.updatedAt}, ${raidPlans.createdAt})`,
      })
      .from(raidPlans)
      .orderBy(
        desc(sql`COALESCE(${raidPlans.updatedAt}, ${raidPlans.createdAt})`),
      )
      .limit(limit);

    return NextResponse.json(
      plans.map((p) => ({
        id: p.id,
        name: p.name,
        zoneId: p.zoneId,
        raidHelperEventId: p.raidHelperEventId,
        startAt: p.startAt?.toISOString() ?? null,
        isPublic: p.isPublic,
        lastModifiedAt: new Date(p.lastModifiedAt).toISOString(),
      })),
    );
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreatePlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { raidHelperEventId, name, zoneId, startAt, cloneFromPlanId } =
      parsed.data;

    // 409 if plan already exists for this event
    const existing = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.raidHelperEventId, raidHelperEventId))
      .limit(1);

    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A raid plan already exists for this event" },
        { status: 409 },
      );
    }

    const planId = await db.transaction(async (tx) => {
      const newPlan = await tx
        .insert(raidPlans)
        .values({
          raidHelperEventId,
          name,
          zoneId,
          startAt: startAt ? new Date(startAt) : undefined,
          createdById: user.id,
          updatedById: user.id,
        })
        .returning({ id: raidPlans.id });

      const id = newPlan[0]!.id;

      if (cloneFromPlanId) {
        const sourcePlan = await tx
          .select({
            defaultAATemplate: raidPlans.defaultAATemplate,
            useDefaultAA: raidPlans.useDefaultAA,
          })
          .from(raidPlans)
          .where(eq(raidPlans.id, cloneFromPlanId))
          .limit(1);

        if (sourcePlan.length > 0) {
          await tx
            .update(raidPlans)
            .set({
              defaultAATemplate: sourcePlan[0]!.defaultAATemplate,
              useDefaultAA: sourcePlan[0]!.useDefaultAA,
            })
            .where(eq(raidPlans.id, id));

          const sourceGroups = await tx
            .select({
              id: raidPlanEncounterGroups.id,
              groupName: raidPlanEncounterGroups.groupName,
              sortOrder: raidPlanEncounterGroups.sortOrder,
            })
            .from(raidPlanEncounterGroups)
            .where(eq(raidPlanEncounterGroups.raidPlanId, cloneFromPlanId))
            .orderBy(raidPlanEncounterGroups.sortOrder);

          const cloneGroupIdMap = new Map<string, string>();
          if (sourceGroups.length > 0) {
            const newGroups = sourceGroups.map((g) => ({
              newId: crypto.randomUUID(),
              groupName: g.groupName,
              sortOrder: g.sortOrder,
              oldId: g.id,
            }));
            await tx.insert(raidPlanEncounterGroups).values(
              newGroups.map((g) => ({
                id: g.newId,
                raidPlanId: id,
                groupName: g.groupName,
                sortOrder: g.sortOrder,
              })),
            );
            for (const g of newGroups) cloneGroupIdMap.set(g.oldId, g.newId);
          }

          const sourceEncounters = await tx
            .select({
              encounterKey: raidPlanEncounters.encounterKey,
              encounterName: raidPlanEncounters.encounterName,
              sortOrder: raidPlanEncounters.sortOrder,
              groupId: raidPlanEncounters.groupId,
              aaTemplate: raidPlanEncounters.aaTemplate,
              useCustomAA: raidPlanEncounters.useCustomAA,
            })
            .from(raidPlanEncounters)
            .where(eq(raidPlanEncounters.raidPlanId, cloneFromPlanId))
            .orderBy(raidPlanEncounters.sortOrder);

          if (sourceEncounters.length > 0) {
            await tx.insert(raidPlanEncounters).values(
              sourceEncounters.map((enc) => ({
                raidPlanId: id,
                encounterKey: enc.encounterKey,
                encounterName: enc.encounterName,
                sortOrder: enc.sortOrder,
                useDefaultGroups: true,
                groupId: enc.groupId
                  ? (cloneGroupIdMap.get(enc.groupId) ?? null)
                  : null,
                aaTemplate: enc.aaTemplate,
                useCustomAA: enc.useCustomAA,
              })),
            );
          }
        }
      } else if (zoneId !== CUSTOM_ZONE_ID) {
        const template = await tx
          .select({
            id: raidPlanTemplates.id,
            defaultAATemplate: raidPlanTemplates.defaultAATemplate,
          })
          .from(raidPlanTemplates)
          .where(
            and(
              eq(raidPlanTemplates.zoneId, zoneId),
              eq(raidPlanTemplates.isActive, true),
            ),
          )
          .limit(1);

        if (template.length > 0) {
          if (template[0]!.defaultAATemplate) {
            await tx
              .update(raidPlans)
              .set({
                defaultAATemplate: template[0]!.defaultAATemplate,
                useDefaultAA: true,
              })
              .where(eq(raidPlans.id, id));
          }

          const [templateGroups, templateEncounters] = await Promise.all([
            tx
              .select({
                id: raidPlanTemplateEncounterGroups.id,
                groupName: raidPlanTemplateEncounterGroups.groupName,
                sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
              })
              .from(raidPlanTemplateEncounterGroups)
              .where(
                eq(raidPlanTemplateEncounterGroups.templateId, template[0]!.id),
              )
              .orderBy(raidPlanTemplateEncounterGroups.sortOrder),
            tx
              .select({
                encounterKey: raidPlanTemplateEncounters.encounterKey,
                encounterName: raidPlanTemplateEncounters.encounterName,
                sortOrder: raidPlanTemplateEncounters.sortOrder,
                groupId: raidPlanTemplateEncounters.groupId,
                aaTemplate: raidPlanTemplateEncounters.aaTemplate,
                useCustomAA: raidPlanTemplateEncounters.useCustomAA,
              })
              .from(raidPlanTemplateEncounters)
              .where(eq(raidPlanTemplateEncounters.templateId, template[0]!.id))
              .orderBy(raidPlanTemplateEncounters.sortOrder),
          ]);

          const templateGroupIdMap = new Map<string, string>();
          if (templateGroups.length > 0) {
            const newGroups = templateGroups.map((g) => ({
              newId: crypto.randomUUID(),
              groupName: g.groupName,
              sortOrder: g.sortOrder,
              oldId: g.id,
            }));
            await tx.insert(raidPlanEncounterGroups).values(
              newGroups.map((g) => ({
                id: g.newId,
                raidPlanId: id,
                groupName: g.groupName,
                sortOrder: g.sortOrder,
              })),
            );
            for (const g of newGroups) templateGroupIdMap.set(g.oldId, g.newId);
          }

          if (templateEncounters.length > 0) {
            await tx.insert(raidPlanEncounters).values(
              templateEncounters.map((enc) => ({
                raidPlanId: id,
                encounterKey: enc.encounterKey,
                encounterName: enc.encounterName,
                sortOrder: enc.sortOrder,
                useDefaultGroups: true,
                groupId: enc.groupId
                  ? (templateGroupIdMap.get(enc.groupId) ?? null)
                  : null,
                aaTemplate: enc.aaTemplate,
                useCustomAA: !!enc.aaTemplate,
              })),
            );
          }
        }
      }

      return id;
    });

    const plan = await db
      .select({
        id: raidPlans.id,
        name: raidPlans.name,
        zoneId: raidPlans.zoneId,
        raidHelperEventId: raidPlans.raidHelperEventId,
        startAt: raidPlans.startAt,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, planId))
      .limit(1);

    return NextResponse.json(
      {
        id: plan[0]!.id,
        name: plan[0]!.name,
        zoneId: plan[0]!.zoneId,
        raidHelperEventId: plan[0]!.raidHelperEventId,
        startAt: plan[0]!.startAt?.toISOString() ?? null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Register POST /api/v1/raid-plans in OpenAPI**

In `src/lib/openapi-registry.ts`, add a new schema before the paths section:

```ts
export const CreatePlanSchema = registry.register(
  "CreatePlan",
  z.object({
    raidHelperEventId: z.string().openapi({ example: "1234567890" }),
    name: z.string().min(1).max(256).openapi({ example: "MC Tuesday" }),
    zoneId: z.string().min(1).max(64).openapi({ example: "moltencore" }),
    startAt: z.string().optional().openapi({
      example: "2026-04-29T23:00:00Z",
      description: "ISO datetime string",
    }),
    cloneFromPlanId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .openapi({ example: null }),
  }),
);
```

Then add a new `registry.registerPath` call after the existing `GET /api/v1/raid-plans` registration:

```ts
registry.registerPath({
  method: "post",
  path: "/api/v1/raid-plans",
  tags: ["Raid Planning"],
  summary: "Create raid plan",
  description:
    "Creates a plan shell for a Raid Helper event. Pass cloneFromPlanId to copy encounter structure and AA settings. Roster is populated separately via sync-signups. Returns 409 if a plan already exists for the event.",
  security: [{ BearerToken: [] }],
  request: {
    body: { content: { "application/json": { schema: CreatePlanSchema } } },
  },
  responses: {
    201: {
      description: "Plan created",
      content: {
        "application/json": {
          schema: z.object({
            id: z
              .string()
              .uuid()
              .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
            name: z.string().openapi({ example: "MC Tuesday" }),
            zoneId: z.string().openapi({ example: "moltencore" }),
            raidHelperEventId: z.string().openapi({ example: "1234567890" }),
            startAt: z
              .string()
              .nullable()
              .openapi({ example: "2026-04-29T23:00:00.000Z" }),
          }),
        },
      },
    },
    400: { description: "Validation error" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    409: { description: "Plan already exists for this event" },
  },
});
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add POST /api/v1/raid-plans endpoint"
```

---

## Task 4: POST /api/v1/raid-plans/:id/sync-signups + OpenAPI

**Files:**

- Create: `src/app/api/v1/raid-plans/[id]/sync-signups/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Create `src/app/api/v1/raid-plans/[id]/sync-signups/route.ts`**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
} from "~/server/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { env } from "~/env";
import { z } from "zod";
import {
  matchSignupsToCharacters,
  resolveClassName,
} from "~/server/api/helpers/match-signups";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

const SyncSignupsSchema = z.object({
  mode: z
    .enum(["addNewSignupsToBench", "fullReimport"])
    .default("addNewSignupsToBench"),
});

interface RaidHelperSignupRaw {
  userId: string;
  name: string;
  className: string;
  specName: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json().catch(() => ({}));
    } catch {
      body = {};
    }

    const parsed = SyncSignupsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { mode } = parsed.data;

    // Fetch the plan
    const plan = await db
      .select({
        id: raidPlans.id,
        raidHelperEventId: raidPlans.raidHelperEventId,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const { raidHelperEventId } = plan[0]!;

    if (!raidHelperEventId) {
      return NextResponse.json(
        { error: "Plan has no linked Raid Helper event" },
        { status: 400 },
      );
    }

    // Fetch event from Raid Helper, resolving lastEventId for recurring events
    const initialRes = await fetch(
      `${RAID_HELPER_API_BASE}/v4/events/${raidHelperEventId}`,
      { headers: { Authorization: env.RAID_HELPER_API_KEY } },
    );

    if (!initialRes.ok) {
      return NextResponse.json(
        { error: "Raid Helper API unavailable" },
        { status: 502 },
      );
    }

    const initialData = (await initialRes.json()) as Record<string, unknown>;

    let signUps: RaidHelperSignupRaw[];
    if (!initialData.signUps && initialData.lastEventId) {
      const resolvedRes = await fetch(
        `${RAID_HELPER_API_BASE}/v4/events/${initialData.lastEventId as string}`,
        { headers: { Authorization: env.RAID_HELPER_API_KEY } },
      );
      if (!resolvedRes.ok) {
        return NextResponse.json(
          { error: "Raid Helper API unavailable" },
          { status: 502 },
        );
      }
      const resolvedData = (await resolvedRes.json()) as {
        signUps?: RaidHelperSignupRaw[];
      };
      signUps = resolvedData.signUps ?? [];
    } else {
      signUps =
        (initialData.signUps as RaidHelperSignupRaw[] | undefined) ?? [];
    }

    // Match signups to DB characters using the shared helper
    const signupInputs = signUps.map((s) => ({
      userId: s.userId,
      discordName: s.name,
      className: s.className,
      specName: s.specName?.replace(/[0-9]/g, "") ?? "",
    }));

    const matchResults = await matchSignupsToCharacters(db, signupInputs);

    // Convert to roster format, skipping bench/absent/tentative
    const newCharacters = matchResults
      .filter((r) => r.status !== "skipped")
      .map((r) => ({
        characterId: r.matchedCharacter?.characterId ?? null,
        characterName: r.matchedCharacter?.characterName ?? r.discordName,
        defaultGroup: null as number | null,
        defaultPosition: null as number | null,
        writeInClass: r.matchedCharacter
          ? null
          : (resolveClassName(r.className, r.specName) ?? null),
      }));

    // Fetch existing roster for two-pass matching
    const existing = await db
      .select({
        id: raidPlanCharacters.id,
        characterId: raidPlanCharacters.characterId,
        characterName: raidPlanCharacters.characterName,
      })
      .from(raidPlanCharacters)
      .where(eq(raidPlanCharacters.raidPlanId, id));

    const matchedExistingIds = new Set<string>();
    const matchedNewIndices = new Set<number>();
    const matches = new Map<
      number,
      { id: string; characterId: number | null; characterName: string }
    >();

    // Pass 1: match by characterId
    for (let i = 0; i < newCharacters.length; i++) {
      const newChar = newCharacters[i]!;
      if (newChar.characterId === null) continue;
      const match = existing.find(
        (e) =>
          !matchedExistingIds.has(e.id) &&
          e.characterId === newChar.characterId,
      );
      if (match) {
        matchedExistingIds.add(match.id);
        matchedNewIndices.add(i);
        matches.set(i, match);
      }
    }

    // Pass 2: match by characterName (case-insensitive)
    for (let i = 0; i < newCharacters.length; i++) {
      if (matchedNewIndices.has(i)) continue;
      const newChar = newCharacters[i]!;
      const match = existing.find(
        (e) =>
          !matchedExistingIds.has(e.id) &&
          e.characterName.toLowerCase() === newChar.characterName.toLowerCase(),
      );
      if (match) {
        matchedExistingIds.add(match.id);
        matchedNewIndices.add(i);
        matches.set(i, match);
      }
    }

    const toInsert = newCharacters.filter((_, i) => !matchedNewIndices.has(i));
    const isMergeOnly = mode === "addNewSignupsToBench";
    const toDelete = isMergeOnly
      ? []
      : existing.filter((e) => !matchedExistingIds.has(e.id)).map((e) => e.id);
    const charactersToUpdate = isMergeOnly ? new Map() : matches;

    await db.transaction(async (tx) => {
      for (const [newIndex, existingRecord] of charactersToUpdate) {
        const newChar = newCharacters[newIndex]!;
        await tx
          .update(raidPlanCharacters)
          .set({
            characterId: newChar.characterId,
            characterName: newChar.characterName,
            defaultGroup: newChar.defaultGroup,
            defaultPosition: newChar.defaultPosition,
            writeInClass: newChar.characterId
              ? null
              : (newChar.writeInClass ?? null),
          })
          .where(eq(raidPlanCharacters.id, existingRecord.id));
      }

      if (toInsert.length > 0) {
        await tx.insert(raidPlanCharacters).values(
          toInsert.map((char) => ({
            raidPlanId: id,
            characterId: char.characterId,
            characterName: char.characterName,
            defaultGroup: isMergeOnly ? null : char.defaultGroup,
            defaultPosition: isMergeOnly ? null : char.defaultPosition,
            writeInClass: char.characterId ? null : (char.writeInClass ?? null),
          })),
        );
      }

      if (toDelete.length > 0) {
        await tx
          .delete(raidPlanCharacters)
          .where(inArray(raidPlanCharacters.id, toDelete));
      }

      if (!isMergeOnly) {
        const customEncounters = await tx
          .select({ id: raidPlanEncounters.id })
          .from(raidPlanEncounters)
          .where(
            and(
              eq(raidPlanEncounters.raidPlanId, id),
              eq(raidPlanEncounters.useDefaultGroups, false),
            ),
          );

        if (customEncounters.length > 0) {
          const customEncounterIds = customEncounters.map((e) => e.id);
          await tx
            .delete(raidPlanEncounterAssignments)
            .where(
              inArray(
                raidPlanEncounterAssignments.encounterId,
                customEncounterIds,
              ),
            );
          await tx
            .update(raidPlanEncounters)
            .set({ useDefaultGroups: true })
            .where(inArray(raidPlanEncounters.id, customEncounterIds));
        }
      }
    });

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({
      added: toInsert.length,
      updated: charactersToUpdate.size,
      removed: toDelete.length,
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Register in OpenAPI**

In `src/lib/openapi-registry.ts`, add before the document builder:

```ts
export const SyncSignupsSchema = registry.register(
  "SyncSignups",
  z.object({
    mode: z
      .enum(["addNewSignupsToBench", "fullReimport"])
      .default("addNewSignupsToBench")
      .openapi({
        example: "addNewSignupsToBench",
        description:
          "addNewSignupsToBench: adds new signups as benched, never removes existing. fullReimport: replaces roster completely.",
      }),
  }),
);

registry.registerPath({
  method: "post",
  path: "/api/v1/raid-plans/{id}/sync-signups",
  tags: ["Raid Planning"],
  summary: "Sync Raid Helper signups",
  description:
    "Fetches current signups from the Raid Helper API and reconciles them against the plan roster. Handles Discord userId → character lookup and fuzzy name matching. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: { content: { "application/json": { schema: SyncSignupsSchema } } },
  },
  responses: {
    200: {
      description: "Sync complete",
      content: {
        "application/json": {
          schema: z.object({
            added: z.number().openapi({ example: 5 }),
            updated: z.number().openapi({ example: 38 }),
            removed: z.number().openapi({ example: 0 }),
          }),
        },
      },
    },
    400: { description: "No linked Raid Helper event, or invalid request" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan not found" },
    502: { description: "Raid Helper API unavailable" },
  },
});
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/sync-signups/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add POST /api/v1/raid-plans/:id/sync-signups endpoint"
```

---

## Task 5: PUT /api/v1/raid-plans/:id/roster + PATCH /:planCharacterId + OpenAPI

**Files:**

- Create: `src/app/api/v1/raid-plans/[id]/roster/route.ts`
- Create: `src/app/api/v1/raid-plans/[id]/roster/[planCharacterId]/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Create `src/app/api/v1/raid-plans/[id]/roster/route.ts`**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans, raidPlanCharacters } from "~/server/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RosterPatchSchema = z
  .array(
    z.object({
      planCharacterId: z.string().uuid(),
      group: z.number().int().min(0).max(7).nullable(),
      position: z.number().int().min(0).max(4).nullable(),
    }),
  )
  .min(1)
  .max(200);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = RosterPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const plan = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const items = parsed.data;
    const planCharacterIds = items.map((i) => i.planCharacterId);

    // Fetch only planCharacter rows that belong to this plan
    const validChars = await db
      .select({ id: raidPlanCharacters.id })
      .from(raidPlanCharacters)
      .where(
        and(
          eq(raidPlanCharacters.raidPlanId, id),
          inArray(raidPlanCharacters.id, planCharacterIds),
        ),
      );

    const validIds = new Set(validChars.map((c) => c.id));
    const validItems = items.filter((i) => validIds.has(i.planCharacterId));

    let updated = 0;
    await db.transaction(async (tx) => {
      for (const item of validItems) {
        await tx
          .update(raidPlanCharacters)
          .set({ defaultGroup: item.group, defaultPosition: item.position })
          .where(eq(raidPlanCharacters.id, item.planCharacterId));
        updated++;
      }
    });

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create `src/app/api/v1/raid-plans/[id]/roster/[planCharacterId]/route.ts`**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans, raidPlanCharacters, characters } from "~/server/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RosterCharacterPatchSchema = z.object({
  characterId: z.number().int().positive(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; planCharacterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, planCharacterId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(planCharacterId)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = RosterCharacterPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify plan exists
    const plan = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    // Verify planCharacter belongs to this plan
    const planChar = await db
      .select({ id: raidPlanCharacters.id })
      .from(raidPlanCharacters)
      .where(
        and(
          eq(raidPlanCharacters.id, planCharacterId),
          eq(raidPlanCharacters.raidPlanId, id),
        ),
      )
      .limit(1);

    if (planChar.length === 0) {
      return NextResponse.json(
        { error: "Roster slot not found" },
        { status: 404 },
      );
    }

    // Verify character exists in the DB
    const character = await db
      .select({ characterId: characters.characterId, name: characters.name })
      .from(characters)
      .where(eq(characters.characterId, parsed.data.characterId))
      .limit(1);

    if (character.length === 0) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 400 },
      );
    }

    await db
      .update(raidPlanCharacters)
      .set({
        characterId: character[0]!.characterId,
        characterName: character[0]!.name,
        writeInClass: null,
      })
      .where(eq(raidPlanCharacters.id, planCharacterId));

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Register both in OpenAPI**

In `src/lib/openapi-registry.ts`, add:

```ts
export const RosterPatchSchema = registry.register(
  "RosterPatch",
  z
    .array(
      z.object({
        planCharacterId: z
          .string()
          .uuid()
          .openapi({ example: "char-plan-uuid" }),
        group: z
          .number()
          .int()
          .min(0)
          .max(7)
          .nullable()
          .openapi({ example: 0, description: "0–7 or null for bench" }),
        position: z
          .number()
          .int()
          .min(0)
          .max(4)
          .nullable()
          .openapi({ example: 2, description: "0–4 or null for bench" }),
      }),
    )
    .openapi({ description: "1–200 items" }),
);

export const RosterCharacterPatchSchema = registry.register(
  "RosterCharacterPatch",
  z.object({
    characterId: z.number().int().positive().openapi({
      example: 456,
      description: "DB character ID to link to this slot",
    }),
  }),
);

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/roster",
  tags: ["Raid Planning"],
  summary: "Bulk update default roster assignments",
  description:
    "Sets defaultGroup/defaultPosition for up to 200 characters in one transaction. Characters not in the list are untouched. IDs not belonging to this plan are silently skipped.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: { content: { "application/json": { schema: RosterPatchSchema } } },
  },
  responses: {
    200: {
      description: "Number of rows updated",
      content: {
        "application/json": {
          schema: z.object({ updated: z.number().openapi({ example: 12 }) }),
        },
      },
    },
    400: { description: "Validation error" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan not found" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/raid-plans/{id}/roster/{planCharacterId}",
  tags: ["Raid Planning"],
  summary: "Re-link roster slot to a DB character",
  description:
    "Updates the characterId on a single roster slot. Use this to resolve an ambiguous signup match — e.g., a write-in that sync-signups couldn't bind to a DB character.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
      planCharacterId: z.string().uuid().openapi({ example: "char-plan-uuid" }),
    }),
    body: {
      content: { "application/json": { schema: RosterCharacterPatchSchema } },
    },
  },
  responses: {
    200: {
      description: "Slot updated",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    400: { description: "Validation error, or characterId not found in DB" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan or roster slot not found" },
  },
});
```

- [ ] **Step 4: Verify**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/roster/route.ts src/app/api/v1/raid-plans/[id]/roster/[planCharacterId]/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add PUT /roster and PATCH /roster/:planCharacterId endpoints"
```

---

## Task 6: PUT /api/v1/raid-plans/:id/encounters/:encounterId + OpenAPI

**Files:**

- Create: `src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,
  raidPlanCharacters,
} from "~/server/db/schema";
import { eq, and, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getSlotNames } from "~/lib/aa-template";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const UpdateEncounterSchema = z
  .object({
    useDefaultGroups: z.boolean().optional(),
    aaTemplate: z.string().max(10000).nullable().optional(),
    useCustomAA: z.boolean().optional(),
    encounterName: z.string().min(1).max(256).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, encounterId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(encounterId)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpdateEncounterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify encounter belongs to this plan
    const encounter = await db
      .select({
        id: raidPlanEncounters.id,
        raidPlanId: raidPlanEncounters.raidPlanId,
      })
      .from(raidPlanEncounters)
      .where(
        and(
          eq(raidPlanEncounters.id, encounterId),
          eq(raidPlanEncounters.raidPlanId, id),
        ),
      )
      .limit(1);

    if (encounter.length === 0) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const { useDefaultGroups, aaTemplate, useCustomAA, encounterName } =
      parsed.data;

    const updates: Partial<{
      useDefaultGroups: boolean;
      aaTemplate: string | null;
      useCustomAA: boolean;
      encounterName: string;
      encounterKey: string;
    }> = {};

    if (useDefaultGroups !== undefined)
      updates.useDefaultGroups = useDefaultGroups;
    if (aaTemplate !== undefined) updates.aaTemplate = aaTemplate;
    if (useCustomAA !== undefined) updates.useCustomAA = useCustomAA;
    if (encounterName !== undefined) {
      updates.encounterName = encounterName;
      updates.encounterKey = slugifyEncounterName(encounterName);
    }

    await db
      .update(raidPlanEncounters)
      .set(updates)
      .where(eq(raidPlanEncounters.id, encounterId));

    // Clean up orphaned AA slot assignments when aaTemplate changes
    if (aaTemplate !== undefined) {
      const slotNames = aaTemplate ? getSlotNames(aaTemplate) : [];
      const conditions = [
        eq(raidPlanEncounterAASlots.encounterId, encounterId),
      ];
      if (slotNames.length > 0) {
        conditions.push(
          notInArray(raidPlanEncounterAASlots.slotName, slotNames),
        );
      }
      await db.delete(raidPlanEncounterAASlots).where(and(...conditions));
    }

    // Seed encounter assignments from defaults when toggling custom groups on
    if (useDefaultGroups === false) {
      const existing = await db
        .select({ id: raidPlanEncounterAssignments.id })
        .from(raidPlanEncounterAssignments)
        .where(eq(raidPlanEncounterAssignments.encounterId, encounterId))
        .limit(1);

      if (existing.length === 0) {
        const planChars = await db
          .select({
            id: raidPlanCharacters.id,
            defaultGroup: raidPlanCharacters.defaultGroup,
            defaultPosition: raidPlanCharacters.defaultPosition,
          })
          .from(raidPlanCharacters)
          .where(eq(raidPlanCharacters.raidPlanId, id));

        if (planChars.length > 0) {
          await db.insert(raidPlanEncounterAssignments).values(
            planChars.map((c) => ({
              encounterId,
              planCharacterId: c.id,
              groupNumber: c.defaultGroup,
              position: c.defaultPosition,
            })),
          );
        }
      }
    }

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Register in OpenAPI**

```ts
export const UpdateEncounterSchema = registry.register(
  "UpdateEncounter",
  z.object({
    useDefaultGroups: z.boolean().optional().openapi({ example: false }),
    aaTemplate: z.string().nullable().optional().openapi({ example: null }),
    useCustomAA: z.boolean().optional().openapi({ example: true }),
    encounterName: z
      .string()
      .min(1)
      .max(256)
      .optional()
      .openapi({ example: "Lucifron" }),
  }),
);

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/encounters/{encounterId}",
  tags: ["Raid Planning"],
  summary: "Update encounter settings",
  description:
    "Partial update of an encounter. All fields are optional — only provided fields are changed. When aaTemplate changes, orphaned AA assignments are deleted. When useDefaultGroups transitions to false, encounter assignments are seeded from current default groups if none exist yet.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
      encounterId: z.string().uuid().openapi({ example: "encounter-uuid" }),
    }),
    body: {
      content: { "application/json": { schema: UpdateEncounterSchema } },
    },
  },
  responses: {
    200: {
      description: "Encounter updated",
      content: {
        "application/json": { schema: z.object({ success: z.boolean() }) },
      },
    },
    400: { description: "Validation error or no fields provided" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Encounter not found or does not belong to this plan" },
  },
});
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add PUT /api/v1/raid-plans/:id/encounters/:encounterId endpoint"
```

---

## Task 7: PUT /api/v1/raid-plans/:id/encounters/:encounterId/roster + OpenAPI

**Files:**

- Create: `src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/roster/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanCharacters,
} from "~/server/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EncounterRosterPatchSchema = z
  .array(
    z.object({
      planCharacterId: z.string().uuid(),
      group: z.number().int().min(0).max(7).nullable(),
      position: z.number().int().min(0).max(4).nullable(),
    }),
  )
  .min(1)
  .max(200);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id, encounterId } = await params;
    if (!UUID_RE.test(id) || !UUID_RE.test(encounterId)) {
      return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = EncounterRosterPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Verify encounter belongs to this plan
    const encounter = await db
      .select({ id: raidPlanEncounters.id })
      .from(raidPlanEncounters)
      .where(
        and(
          eq(raidPlanEncounters.id, encounterId),
          eq(raidPlanEncounters.raidPlanId, id),
        ),
      )
      .limit(1);

    if (encounter.length === 0) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const items = parsed.data;
    const planCharacterIds = items.map((i) => i.planCharacterId);

    // Only process planCharacters that belong to this plan
    const validChars = await db
      .select({ id: raidPlanCharacters.id })
      .from(raidPlanCharacters)
      .where(
        and(
          eq(raidPlanCharacters.raidPlanId, id),
          inArray(raidPlanCharacters.id, planCharacterIds),
        ),
      );

    const validIds = new Set(validChars.map((c) => c.id));
    const validItems = items.filter((i) => validIds.has(i.planCharacterId));

    let updated = 0;
    await db.transaction(async (tx) => {
      for (const item of validItems) {
        // Upsert: try update first, insert if no rows affected
        const result = await tx
          .update(raidPlanEncounterAssignments)
          .set({ groupNumber: item.group, position: item.position })
          .where(
            and(
              eq(raidPlanEncounterAssignments.encounterId, encounterId),
              eq(
                raidPlanEncounterAssignments.planCharacterId,
                item.planCharacterId,
              ),
            ),
          )
          .returning({ id: raidPlanEncounterAssignments.id });

        if (result.length === 0) {
          await tx.insert(raidPlanEncounterAssignments).values({
            encounterId,
            planCharacterId: item.planCharacterId,
            groupNumber: item.group,
            position: item.position,
          });
        }
        updated++;
      }
    });

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ updated });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Register in OpenAPI**

```ts
registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/encounters/{encounterId}/roster",
  tags: ["Raid Planning"],
  summary: "Bulk update per-encounter group assignments",
  description:
    "Sets per-encounter group/position for up to 200 characters in one transaction. Uses upsert semantics — inserts a row if none exists for that encounter+character pair. IDs not belonging to this plan are silently skipped.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
      encounterId: z.string().uuid().openapi({ example: "encounter-uuid" }),
    }),
    body: { content: { "application/json": { schema: RosterPatchSchema } } },
  },
  responses: {
    200: {
      description: "Number of rows upserted",
      content: {
        "application/json": {
          schema: z.object({ updated: z.number().openapi({ example: 8 }) }),
        },
      },
    },
    400: { description: "Validation error" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Encounter not found or does not belong to this plan" },
  },
});
```

- [ ] **Step 3: Verify**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/encounters/[encounterId]/roster/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add PUT /api/v1/raid-plans/:id/encounters/:encounterId/roster endpoint"
```

---

## Task 8: PUT /api/v1/raid-plans/:id/aa-slots + OpenAPI

**Files:**

- Create: `src/app/api/v1/raid-plans/[id]/aa-slots/route.ts`
- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans, raidPlanEncounterAASlots } from "~/server/db/schema";
import { eq, and, max } from "drizzle-orm";
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AASlotAssignRequestSchema = z
  .array(
    z.object({
      slotName: z.string().min(1).max(128),
      planCharacterId: z.string().uuid(),
      encounterId: z.string().uuid().nullable(),
    }),
  )
  .min(1)
  .max(200);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = AASlotAssignRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const plan = await db
      .select({ id: raidPlans.id })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    let assigned = 0;
    let skipped = 0;

    // Serial (not parallel) to preserve sort order correctness
    for (const item of parsed.data) {
      const isEncounterLevel = item.encounterId !== null;

      // Check if already assigned
      const existingCheck = isEncounterLevel
        ? and(
            eq(raidPlanEncounterAASlots.encounterId, item.encounterId!),
            eq(raidPlanEncounterAASlots.planCharacterId, item.planCharacterId),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          )
        : and(
            eq(raidPlanEncounterAASlots.raidPlanId, id),
            eq(raidPlanEncounterAASlots.planCharacterId, item.planCharacterId),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          );

      const existing = await db
        .select({ id: raidPlanEncounterAASlots.id })
        .from(raidPlanEncounterAASlots)
        .where(existingCheck)
        .limit(1);

      if (existing.length > 0) {
        skipped++;
        continue;
      }

      // Get max sort order for this slot
      const whereClause = isEncounterLevel
        ? and(
            eq(raidPlanEncounterAASlots.encounterId, item.encounterId!),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          )
        : and(
            eq(raidPlanEncounterAASlots.raidPlanId, id),
            eq(raidPlanEncounterAASlots.slotName, item.slotName),
          );

      const maxSortResult = await db
        .select({ maxSort: max(raidPlanEncounterAASlots.sortOrder) })
        .from(raidPlanEncounterAASlots)
        .where(whereClause);

      const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

      await db.insert(raidPlanEncounterAASlots).values({
        encounterId: item.encounterId ?? null,
        raidPlanId: isEncounterLevel ? null : id,
        planCharacterId: item.planCharacterId,
        slotName: item.slotName,
        sortOrder: nextSortOrder,
      });

      assigned++;
    }

    await db
      .update(raidPlans)
      .set({ updatedById: user.id })
      .where(eq(raidPlans.id, id));

    return NextResponse.json({ assigned, skipped });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Register in OpenAPI**

```ts
export const AASlotAssignRequestSchema = registry.register(
  "AASlotAssignRequest",
  z
    .array(
      z.object({
        slotName: z.string().min(1).max(128).openapi({ example: "Main Tank" }),
        planCharacterId: z
          .string()
          .uuid()
          .openapi({ example: "char-plan-uuid" }),
        encounterId: z.string().uuid().nullable().openapi({
          example: null,
          description:
            "null = plan-level default slot; UUID = encounter-specific slot",
        }),
      }),
    )
    .openapi({ description: "1–200 items" }),
);

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/aa-slots",
  tags: ["Raid Planning"],
  summary: "Bulk assign AA slots",
  description:
    "Merge semantics: upserts by (slotName, encounterId, planCharacterId). Slots not mentioned are left untouched. Runs serially to preserve sortOrder correctness.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: {
      content: { "application/json": { schema: AASlotAssignRequestSchema } },
    },
  },
  responses: {
    200: {
      description: "Number of rows inserted vs skipped (already existed)",
      content: {
        "application/json": {
          schema: z.object({
            assigned: z.number().openapi({ example: 3 }),
            skipped: z.number().openapi({ example: 1 }),
          }),
        },
      },
    },
    400: { description: "Validation error" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan not found" },
  },
});
```

- [ ] **Step 3: Final typecheck and lint**

```bash
pnpm typecheck && pnpm lint
```

Expected: no errors or warnings (lint runs on the whole project).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/aa-slots/route.ts src/lib/openapi-registry.ts
git commit -m "feat(api): add PUT /api/v1/raid-plans/:id/aa-slots endpoint"
```

---

## Manual Verification

After all tasks complete, test with `TOKEN=tera_e0468df3f8fb64aa3e13425179fff263` and a running dev server (`pnpm dev`):

```bash
# Stage 3a enhancement — availableSlots in plan detail
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/raid-plans | jq '.[0].id' | xargs -I{} curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/raid-plans/{} | jq '{availableSlots, encounters: [.encounters[0] | {encounterName, availableSlots}]}'

# Create a plan (use a real event ID from GET /api/v1/events)
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"raidHelperEventId":"TEST123","name":"Test Plan","zoneId":"moltencore"}' \
  http://localhost:3000/api/v1/raid-plans

# Verify 409 on duplicate
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"raidHelperEventId":"TEST123","name":"Test Plan","zoneId":"moltencore"}' \
  http://localhost:3000/api/v1/raid-plans

# Bulk roster patch (use real planCharacterId from GET /api/v1/raid-plans/:id)
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '[{"planCharacterId":"<uuid>","group":0,"position":0}]' \
  http://localhost:3000/api/v1/raid-plans/<planId>/roster

# AA slots
curl -s -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '[{"slotName":"Main Tank","planCharacterId":"<uuid>","encounterId":null}]' \
  http://localhost:3000/api/v1/raid-plans/<planId>/aa-slots

# OpenAPI spec includes new paths
curl -s http://localhost:3000/api/v1/openapi.json | jq '.paths | keys'
```
