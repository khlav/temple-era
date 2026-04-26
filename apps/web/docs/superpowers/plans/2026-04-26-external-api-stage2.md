# External REST API — Stage 2: Character Family Management

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two write endpoints for managing character family relationships — linking secondaries to a primary and unlinking a secondary from its primary.

**Architecture:** Two new Next.js route handlers under `src/app/api/v1/characters/[id]/`, each following the identical pattern of Stage 1 routes: `validateApiToken` → `isRaidManager || isAdmin` guard → Zod body validation → Drizzle update → JSON response. The OpenAPI registry gets two new schemas and two new registered paths.

**Tech Stack:** Next.js 15 App Router route handlers, Drizzle ORM, Zod, `@asteasolutions/zod-to-openapi`

---

## File Map

| File                                                  | Change                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `src/app/api/v1/characters/[id]/secondaries/route.ts` | New — PUT handler                                                     |
| `src/app/api/v1/characters/[id]/primary/route.ts`     | New — DELETE handler                                                  |
| `src/lib/openapi-registry.ts`                         | Add `FamilyUpdateSchema`, `FamilyResponseSchema`, register both paths |

---

## Key Domain Context

- `characters.isPrimary` is a **generated column** — it is `true` when `primaryCharacterId IS NULL` (standalone) OR `characterId = primaryCharacterId` (self-referencing primary). It is `false` only when the character is a secondary of another character.
- The two-step replace pattern (used by the existing `updatePrimaryCharacter` tRPC procedure in `src/server/api/routers/character.ts:418-440`) is: (1) clear all existing rows where `primaryCharacterId = :primaryId`, then (2) set `primaryCharacterId = :primaryId` on the incoming IDs.
- `validateApiToken` (in `src/server/api/v1-auth.ts`) returns `{ user }` or `{ error: NextResponse }`. The `user` object includes `isRaidManager: boolean | null` and `isAdmin: boolean | null`.
- No test suite exists; verification is `pnpm typecheck` + curl.

---

## Task 1: PUT /api/v1/characters/:primaryId/secondaries

**Files:**

- Create: `src/app/api/v1/characters/[id]/secondaries/route.ts`

**Behaviour:**

- Validates auth + raid manager permission
- Validates `primaryId` is an integer, character exists, and `isPrimary = true`
- Parses body: `{ secondaryIds: number[], mode: "replace" | "append" }` (mode defaults to `"replace"`)
- Validates `secondaryIds` is non-empty and does not include `primaryId`
- `replace` mode: runs the two-step update directly
- `append` mode: fetches current secondaries first, dedupes with incoming, then runs the same two-step update
- Returns the updated list of secondaries

- [ ] **Step 1: Create the route file**

Create `src/app/api/v1/characters/[id]/secondaries/route.ts` with this exact content:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";

const BodySchema = z.object({
  secondaryIds: z.array(z.number().int()).min(1),
  mode: z.enum(["replace", "append"]).default("replace"),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { user } = authResult;
    if (!user.isRaidManager && !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const primaryId = parseInt(id, 10);
    if (isNaN(primaryId)) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { secondaryIds, mode } = parsed.data;

    if (secondaryIds.includes(primaryId)) {
      return NextResponse.json(
        { error: "secondaryIds must not include the primary character ID" },
        { status: 400 },
      );
    }

    const primary = await db.query.characters.findFirst({
      where: eq(characters.characterId, primaryId),
      columns: { characterId: true, isPrimary: true },
    });

    if (!primary) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    if (!primary.isPrimary) {
      return NextResponse.json(
        {
          error:
            "Character is not a primary (it may be a secondary of another character)",
        },
        { status: 400 },
      );
    }

    let finalSecondaryIds = secondaryIds;

    if (mode === "append") {
      const current = await db
        .select({ characterId: characters.characterId })
        .from(characters)
        .where(eq(characters.primaryCharacterId, primaryId));
      const existingIds = current.map((c) => c.characterId);
      finalSecondaryIds = [...new Set([...existingIds, ...secondaryIds])];
    }

    // Two-step replace: clear existing, set new
    await db
      .update(characters)
      .set({ primaryCharacterId: null })
      .where(eq(characters.primaryCharacterId, primaryId));

    await db
      .update(characters)
      .set({ primaryCharacterId: primaryId })
      .where(inArray(characters.characterId, finalSecondaryIds));

    const updated = await db
      .select({
        characterId: characters.characterId,
        name: characters.name,
        class: characters.class,
        server: characters.server,
      })
      .from(characters)
      .where(eq(characters.primaryCharacterId, primaryId));

    return NextResponse.json({
      primaryCharacterId: primaryId,
      secondaryCharacters: updated,
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

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors related to `secondaries/route.ts`.

- [ ] **Step 3: Smoke test with curl (replace mode)**

Replace `<token>` with your API token and `<primaryId>` / `<secondaryId>` with real character IDs from your DB. Use the character search endpoint to find IDs if needed:

```bash
# Find a primary character
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/characters?type=primary&q=khlav" | jq .

# Set a secondary (replace mode)
curl -s -X PUT \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"secondaryIds":[<secondaryId>],"mode":"replace"}' \
  "http://localhost:3000/api/v1/characters/<primaryId>/secondaries" | jq .
```

Expected 200 response:

```json
{
  "primaryCharacterId": <primaryId>,
  "secondaryCharacters": [
    { "characterId": <secondaryId>, "name": "...", "class": "...", "server": "..." }
  ]
}
```

- [ ] **Step 4: Smoke test error cases**

```bash
# 401 — no token
curl -s -X PUT \
  -H "Content-Type: application/json" \
  -d '{"secondaryIds":[<secondaryId>]}' \
  "http://localhost:3000/api/v1/characters/<primaryId>/secondaries" | jq .
# Expected: {"error":"Unauthorized"} with 401

# 400 — secondaryIds includes primaryId
curl -s -X PUT \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"secondaryIds":[<primaryId>]}' \
  "http://localhost:3000/api/v1/characters/<primaryId>/secondaries" | jq .
# Expected: {"error":"secondaryIds must not include the primary character ID"} with 400

# 404 — non-existent primary
curl -s -X PUT \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"secondaryIds":[<secondaryId>]}' \
  "http://localhost:3000/api/v1/characters/999999999/secondaries" | jq .
# Expected: {"error":"Character not found"} with 404
```

- [ ] **Step 5: Smoke test append mode**

```bash
# Append a second secondary without replacing the first
curl -s -X PUT \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"secondaryIds":[<anotherSecondaryId>],"mode":"append"}' \
  "http://localhost:3000/api/v1/characters/<primaryId>/secondaries" | jq .
```

Expected: 200 with `secondaryCharacters` containing both the original secondary and the newly appended one.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/v1/characters/[id]/secondaries/route.ts
git commit -m "feat(api): add PUT /api/v1/characters/:id/secondaries endpoint"
```

---

## Task 2: DELETE /api/v1/characters/:id/primary

**Files:**

- Create: `src/app/api/v1/characters/[id]/primary/route.ts`

**Behaviour:**

- Validates auth + raid manager permission
- Checks character exists and has `primaryCharacterId` set (i.e. it is a secondary)
- Direct single-column update: `SET primary_character_id = NULL WHERE character_id = :id`
- Returns `{ characterId, name }` — `isPrimary` regenerates automatically, no re-fetch needed

- [ ] **Step 1: Create the route file**

Create `src/app/api/v1/characters/[id]/primary/route.ts` with this exact content:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { characters } from "~/server/db/schema";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;

    const { user } = authResult;
    if (!user.isRaidManager && !user.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const characterId = parseInt(id, 10);
    if (isNaN(characterId)) {
      return NextResponse.json(
        { error: "Invalid character ID" },
        { status: 400 },
      );
    }

    const char = await db.query.characters.findFirst({
      where: eq(characters.characterId, characterId),
      columns: { characterId: true, name: true, primaryCharacterId: true },
    });

    if (!char) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    if (char.primaryCharacterId === null) {
      return NextResponse.json(
        { error: "Character is not a secondary (has no primary to unlink)" },
        { status: 400 },
      );
    }

    await db
      .update(characters)
      .set({ primaryCharacterId: null })
      .where(eq(characters.characterId, characterId));

    return NextResponse.json({
      characterId: char.characterId,
      name: char.name,
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

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors related to `primary/route.ts`.

- [ ] **Step 3: Smoke test the happy path**

Use the secondary character ID you linked in Task 1:

```bash
curl -s -X DELETE \
  -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/characters/<secondaryId>/primary" | jq .
```

Expected 200:

```json
{ "characterId": <secondaryId>, "name": "Althlav" }
```

Verify the unlink worked by fetching the character:

```bash
curl -s -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/characters/<secondaryId>" | jq '.primaryCharacterId,.isPrimary'
```

Expected: `null` and `true` (now standalone).

- [ ] **Step 4: Smoke test error cases**

```bash
# 400 — character has no primary (already standalone)
curl -s -X DELETE \
  -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/characters/<secondaryId>/primary" | jq .
# Expected: {"error":"Character is not a secondary (has no primary to unlink)"} with 400

# 404 — non-existent character
curl -s -X DELETE \
  -H "Authorization: Bearer <token>" \
  "http://localhost:3000/api/v1/characters/999999999/primary" | jq .
# Expected: {"error":"Character not found"} with 404

# 401 — no token
curl -s -X DELETE \
  "http://localhost:3000/api/v1/characters/<secondaryId>/primary" | jq .
# Expected: {"error":"Unauthorized"} with 401
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/v1/characters/[id]/primary/route.ts
git commit -m "feat(api): add DELETE /api/v1/characters/:id/primary endpoint"
```

---

## Task 3: OpenAPI Registry — Stage 2 Schemas and Paths

**Files:**

- Modify: `src/lib/openapi-registry.ts`

**Changes:** Add `FamilyUpdateSchema` and `FamilyResponseSchema` after the existing schemas, then register the two new paths after the existing paths.

- [ ] **Step 1: Add schemas to the registry**

In `src/lib/openapi-registry.ts`, after the `MeSchema` block (around line 103) and before the `// ─── Paths` divider, add:

```ts
export const FamilyUpdateSchema = registry.register(
  "FamilyUpdate",
  z.object({
    secondaryIds: z
      .array(z.number().int())
      .min(1)
      .openapi({
        example: [456, 789],
        description: "Character IDs to set as secondaries",
      }),
    mode: z.enum(["replace", "append"]).default("replace").openapi({
      example: "replace",
      description:
        "replace: clears existing secondaries and sets new list. append: merges with existing secondaries.",
    }),
  }),
);

export const FamilyResponseSchema = registry.register(
  "FamilyResponse",
  z.object({
    primaryCharacterId: z.number().openapi({ example: 123 }),
    secondaryCharacters: z.array(
      z.object({
        characterId: z.number().openapi({ example: 456 }),
        name: z.string().openapi({ example: "Althlav" }),
        class: z.string().openapi({ example: "Rogue" }),
        server: z.string().openapi({ example: "Mankrik" }),
      }),
    ),
  }),
);
```

- [ ] **Step 2: Register the two new paths**

In `src/lib/openapi-registry.ts`, after the existing `registry.registerPath` calls (after the `/api/v1/openapi.json` path block, around line 218), add:

```ts
registry.registerPath({
  method: "put",
  path: "/api/v1/characters/{id}/secondaries",
  tags: ["Characters"],
  summary: "Set secondary characters",
  description:
    "Sets secondary characters for a primary. Requires isRaidManager. Mode 'replace' (default) clears all existing secondaries and sets the new list. Mode 'append' merges incoming IDs with existing secondaries (deduped).",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ example: "123" }),
    }),
    body: {
      content: {
        "application/json": { schema: FamilyUpdateSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated secondary characters",
      content: {
        "application/json": { schema: FamilyResponseSchema },
      },
    },
    400: {
      description:
        "Invalid input, character is not a primary, or secondaryIds includes primaryId",
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager or admin" },
    404: { description: "Primary character not found" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/characters/{id}/primary",
  tags: ["Characters"],
  summary: "Unlink character from its primary",
  description:
    "Removes a character from its primary family, making it standalone. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ example: "456" }),
    }),
  },
  responses: {
    200: {
      description: "Character successfully unlinked from its primary",
      content: {
        "application/json": {
          schema: z.object({
            characterId: z.number().openapi({ example: 456 }),
            name: z.string().openapi({ example: "Althlav" }),
          }),
        },
      },
    },
    400: {
      description: "Character is not a secondary (has no primary to unlink)",
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager or admin" },
    404: { description: "Character not found" },
  },
});
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Verify spec includes new paths**

```bash
curl -s http://localhost:3000/api/v1/openapi.json | jq '.paths | keys'
```

Expected output includes:

```json
[
  "/api/v1/characters",
  "/api/v1/characters/{id}",
  "/api/v1/characters/{id}/attendance",
  "/api/v1/characters/{id}/primary",
  "/api/v1/characters/{id}/secondaries",
  "/api/v1/me",
  "/api/v1/openapi.json"
]
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/openapi-registry.ts
git commit -m "feat(api): register Stage 2 schemas and paths in OpenAPI spec"
```
