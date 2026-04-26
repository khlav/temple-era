# External REST API — Stage 3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three read-only raid plan endpoints — `GET /api/v1/events`, `GET /api/v1/raid-plans`, `GET /api/v1/raid-plans/:id` — plus their OpenAPI schema registrations.

**Architecture:** Three new Next.js route handlers in `src/app/api/v1/`. All use the existing `validateApiToken` helper and require `isRaidManager = true`. The events endpoint calls the Raid Helper external API (same logic as the `getScheduledEvents` tRPC procedure). The raid plan endpoints query the database directly using Drizzle, mirroring the `getById` and `getPastPlans` tRPC procedures.

**Tech Stack:** Next.js 15 App Router route handlers, Drizzle ORM, `@asteasolutions/zod-to-openapi`, Raid Helper external API (`RAID_HELPER_API_KEY` env var).

---

## File Map

| File                                      | Change                             |
| ----------------------------------------- | ---------------------------------- |
| `src/app/api/v1/events/route.ts`          | New — GET handler                  |
| `src/app/api/v1/raid-plans/route.ts`      | New — GET handler                  |
| `src/app/api/v1/raid-plans/[id]/route.ts` | New — GET handler                  |
| `src/lib/openapi-registry.ts`             | Add schemas + 3 path registrations |

---

## Task 1: GET /api/v1/events

**Files:**

- Create: `src/app/api/v1/events/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans } from "~/server/db/schema";
import { inArray } from "drizzle-orm";
import { inferTalentRole } from "~/lib/class-specs";
import { env } from "~/env";
import { formatInTimeZone } from "date-fns-tz";

const RAID_HELPER_API_BASE = "https://raid-helper.xyz/api";

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

function resolveClassName(className: string, specName?: string): string | null {
  const lc = className.toLowerCase();
  if (SKIP_CLASS_NAMES.has(lc)) return null;
  if (WOW_CLASSES.has(lc)) return lc.charAt(0).toUpperCase() + lc.slice(1);
  if (lc === "tank" && specName)
    return TANK_SPEC_TO_CLASS[specName.toLowerCase()] ?? null;
  return null;
}

function resolveEventTitle(title: string, startTime: number): string {
  return title.replace(/\{eventtime#([^}]+)\}/gi, (_, fmt: string) => {
    const date = new Date(startTime * 1000);
    const dateFnsFormat = fmt
      .replace(/E(?!E)/g, "EEE")
      .replace(/EEEE/g, "EEEE")
      .replace(/a/g, "aaa");
    try {
      return formatInTimeZone(date, "America/New_York", dateFnsFormat);
    } catch {
      return `{eventtime#${fmt}}`;
    }
  });
}

interface PostedEvent {
  id: string;
  title: string;
  channelName?: string;
  startTime: number;
  signUpCount?: number | string;
  channelId: string;
}
interface PostedEventsResponse {
  postedEvents: PostedEvent[];
}
interface RaidHelperSignup {
  className: string;
  specName: string;
}
interface RaidHelperEventResponse {
  signUps?: RaidHelperSignup[];
}

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const hoursBack = Math.max(0, Number(searchParams.get("hoursBack") ?? "0"));

    // Fetch event list from Raid Helper
    const listRes = await fetch(
      `${RAID_HELPER_API_BASE}/v4/servers/${env.DISCORD_SERVER_ID}/events`,
      { headers: { Authorization: env.RAID_HELPER_API_KEY } },
    );

    if (listRes.status === 404) {
      return NextResponse.json([]);
    }

    if (!listRes.ok) {
      return NextResponse.json(
        { error: "Raid Helper API unavailable" },
        { status: 502 },
      );
    }

    const listData = (await listRes.json()) as PostedEventsResponse;
    const secondsPerHour = 3600;
    const minStartTime =
      Math.floor(Date.now() / 1000) - secondsPerHour * hoursBack;

    const filtered = listData.postedEvents
      .filter((e) => e.startTime >= minStartTime)
      .sort((a, b) => a.startTime - b.startTime);

    // Fetch per-event detail for role counts (parallel)
    const eventsWithRoles = await Promise.all(
      filtered.map(async (e) => {
        const roleCounts = { Tank: 0, Healer: 0, Melee: 0, Ranged: 0 };
        try {
          const detailRes = await fetch(
            `${RAID_HELPER_API_BASE}/v4/events/${e.id}`,
            { headers: { Authorization: env.RAID_HELPER_API_KEY } },
          );
          if (detailRes.ok) {
            const detail = (await detailRes.json()) as RaidHelperEventResponse;
            for (const signup of detail.signUps ?? []) {
              const specName = signup.specName?.replace(/[0-9]/g, "") ?? "";
              const resolvedClass = resolveClassName(
                signup.className,
                specName,
              );
              if (!resolvedClass) continue;
              const role = inferTalentRole(resolvedClass, specName);
              if (role in roleCounts)
                roleCounts[role as keyof typeof roleCounts]++;
            }
          }
        } catch (err) {
          console.error(`Failed to fetch details for event ${e.id}`, err);
        }
        return {
          id: e.id,
          title: e.title,
          displayTitle: resolveEventTitle(e.title, e.startTime),
          startTime: e.startTime,
          signUpCount:
            typeof e.signUpCount === "string"
              ? Number(e.signUpCount)
              : (e.signUpCount ?? 0),
          roleCounts,
        };
      }),
    );

    // Annotate with existing plan status
    const eventIds = eventsWithRoles.map((e) => e.id);
    const existingPlans =
      eventIds.length > 0
        ? await db
            .select({
              id: raidPlans.id,
              raidHelperEventId: raidPlans.raidHelperEventId,
              updatedAt: raidPlans.updatedAt,
              createdAt: raidPlans.createdAt,
            })
            .from(raidPlans)
            .where(inArray(raidPlans.raidHelperEventId, eventIds))
        : [];

    const planMap = new Map(
      existingPlans.map((p) => [
        p.raidHelperEventId,
        {
          id: p.id,
          lastModifiedAt: (p.updatedAt ?? p.createdAt).toISOString(),
        },
      ]),
    );

    return NextResponse.json(
      eventsWithRoles.map((e) => ({
        ...e,
        existingPlan: planMap.get(e.id) ?? null,
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/kirkhlavka/workspace/repos/temple-raids/temple-raids-t3/.worktrees/feature-external-api
pnpm typecheck 2>&1 | head -40
```

Expected: no errors related to the new file.

- [ ] **Step 3: Manual smoke test**

```bash
# Replace TOKEN with the tera_ token from your profile page
curl -s -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/events | jq '.[0]'
```

Expected: object with `id`, `title`, `displayTitle`, `startTime`, `signUpCount`, `roleCounts`, `existingPlan`.

```bash
# 403 without raidManager token
curl -s -H "Authorization: Bearer ADMIN_ONLY_TOKEN" http://localhost:3000/api/v1/events
# Expected: {"error":"Forbidden"}

# 401 without token
curl -s http://localhost:3000/api/v1/events
# Expected: {"error":"Unauthorized"}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/events/route.ts
git commit -m "feat(api): add GET /api/v1/events endpoint"
```

---

## Task 2: GET /api/v1/raid-plans

**Files:**

- Create: `src/app/api/v1/raid-plans/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import { raidPlans } from "~/server/db/schema";
import { desc, sql } from "drizzle-orm";

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
        lastModifiedAt: p.lastModifiedAt.toISOString(),
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 3: Manual smoke test**

```bash
curl -s -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/raid-plans | jq 'length'
# Expected: a number 0-20

curl -s -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/raid-plans?limit=5" | jq 'length'
# Expected: number <= 5

curl -s -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/raid-plans?limit=100" | jq 'length'
# Expected: number <= 50 (capped)
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/route.ts
git commit -m "feat(api): add GET /api/v1/raid-plans endpoint"
```

---

## Task 3: GET /api/v1/raid-plans/:id

**Files:**

- Create: `src/app/api/v1/raid-plans/[id]/route.ts`

- [ ] **Step 1: Create the route file**

```ts
import { NextResponse } from "next/server";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlans,
  raidPlanCharacters,
  raidPlanEncounterGroups,
  raidPlanEncounters,
  raidPlanEncounterAssignments,
  raidPlanEncounterAASlots,
  characters,
} from "~/server/db/schema";
import { eq, inArray, or, sql } from "drizzle-orm";

export async function GET(
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

    // Basic UUID format check (prevents malformed DB queries)
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(id)) {
      return NextResponse.json({ error: "Invalid plan ID" }, { status: 400 });
    }

    const plan = await db
      .select({
        id: raidPlans.id,
        name: raidPlans.name,
        zoneId: raidPlans.zoneId,
        raidHelperEventId: raidPlans.raidHelperEventId,
        startAt: raidPlans.startAt,
        isPublic: raidPlans.isPublic,
        defaultAATemplate: raidPlans.defaultAATemplate,
        useDefaultAA: raidPlans.useDefaultAA,
        lastModifiedAt: sql<Date>`COALESCE(${raidPlans.updatedAt}, ${raidPlans.createdAt})`,
      })
      .from(raidPlans)
      .where(eq(raidPlans.id, id))
      .limit(1);

    if (plan.length === 0) {
      return NextResponse.json({ error: "Plan not found" }, { status: 404 });
    }

    const [planCharacters, encounters, encounterGroups] = await Promise.all([
      db
        .select({
          id: raidPlanCharacters.id,
          characterId: raidPlanCharacters.characterId,
          characterName: raidPlanCharacters.characterName,
          defaultGroup: raidPlanCharacters.defaultGroup,
          defaultPosition: raidPlanCharacters.defaultPosition,
          class: sql<
            string | null
          >`COALESCE(${characters.class}, ${raidPlanCharacters.writeInClass})`,
        })
        .from(raidPlanCharacters)
        .leftJoin(
          characters,
          eq(raidPlanCharacters.characterId, characters.characterId),
        )
        .where(eq(raidPlanCharacters.raidPlanId, id))
        .orderBy(
          raidPlanCharacters.defaultGroup,
          raidPlanCharacters.defaultPosition,
          raidPlanCharacters.characterName,
          raidPlanCharacters.id,
        ),
      db
        .select({
          id: raidPlanEncounters.id,
          encounterKey: raidPlanEncounters.encounterKey,
          encounterName: raidPlanEncounters.encounterName,
          sortOrder: raidPlanEncounters.sortOrder,
          groupId: raidPlanEncounters.groupId,
          useDefaultGroups: raidPlanEncounters.useDefaultGroups,
          aaTemplate: raidPlanEncounters.aaTemplate,
          useCustomAA: raidPlanEncounters.useCustomAA,
        })
        .from(raidPlanEncounters)
        .where(eq(raidPlanEncounters.raidPlanId, id))
        .orderBy(raidPlanEncounters.sortOrder),
      db
        .select({
          id: raidPlanEncounterGroups.id,
          groupName: raidPlanEncounterGroups.groupName,
          sortOrder: raidPlanEncounterGroups.sortOrder,
        })
        .from(raidPlanEncounterGroups)
        .where(eq(raidPlanEncounterGroups.raidPlanId, id))
        .orderBy(raidPlanEncounterGroups.sortOrder),
    ]);

    // Only fetch encounter assignments for encounters with custom groups
    const customEncounterIds = encounters
      .filter((e) => !e.useDefaultGroups)
      .map((e) => e.id);

    let encounterAssignments: {
      encounterId: string;
      planCharacterId: string;
      groupNumber: number | null;
      position: number | null;
    }[] = [];

    if (customEncounterIds.length > 0) {
      encounterAssignments = await db
        .select({
          encounterId: raidPlanEncounterAssignments.encounterId,
          planCharacterId: raidPlanEncounterAssignments.planCharacterId,
          groupNumber: raidPlanEncounterAssignments.groupNumber,
          position: raidPlanEncounterAssignments.position,
        })
        .from(raidPlanEncounterAssignments)
        .where(
          inArray(raidPlanEncounterAssignments.encounterId, customEncounterIds),
        )
        .orderBy(
          raidPlanEncounterAssignments.encounterId,
          raidPlanEncounterAssignments.groupNumber,
          raidPlanEncounterAssignments.position,
        );
    }

    // Fetch AA slot assignments (encounter-specific + plan-level default)
    const encounterIds = encounters.map((e) => e.id);
    const aaSlotConditions = [
      eq(raidPlanEncounterAASlots.raidPlanId, id),
    ] as Parameters<typeof or>;
    if (encounterIds.length > 0) {
      aaSlotConditions.push(
        inArray(raidPlanEncounterAASlots.encounterId, encounterIds),
      );
    }

    const aaSlotAssignments = await db
      .select({
        id: raidPlanEncounterAASlots.id,
        encounterId: raidPlanEncounterAASlots.encounterId,
        raidPlanId: raidPlanEncounterAASlots.raidPlanId,
        planCharacterId: raidPlanEncounterAASlots.planCharacterId,
        slotName: raidPlanEncounterAASlots.slotName,
      })
      .from(raidPlanEncounterAASlots)
      .where(or(...aaSlotConditions))
      .orderBy(raidPlanEncounterAASlots.sortOrder);

    const p = plan[0]!;
    return NextResponse.json({
      id: p.id,
      name: p.name,
      zoneId: p.zoneId,
      raidHelperEventId: p.raidHelperEventId,
      startAt: p.startAt?.toISOString() ?? null,
      isPublic: p.isPublic,
      defaultAATemplate: p.defaultAATemplate,
      useDefaultAA: p.useDefaultAA,
      lastModifiedAt: p.lastModifiedAt.toISOString(),
      characters: planCharacters,
      encounterGroups,
      encounters,
      encounterAssignments,
      aaSlotAssignments,
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

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no new errors.

- [ ] **Step 3: Manual smoke test**

```bash
# Get an ID from the list endpoint first
PLAN_ID=$(curl -s -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/raid-plans | jq -r '.[0].id')
echo $PLAN_ID

curl -s -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/raid-plans/$PLAN_ID" | jq '{id,name,zoneId,characterCount: (.characters | length), encounterCount: (.encounters | length)}'
# Expected: object with counts > 0 for a real plan

# 404 for non-existent plan
curl -s -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/raid-plans/00000000-0000-0000-0000-000000000000"
# Expected: {"error":"Plan not found"}

# 400 for malformed ID
curl -s -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/raid-plans/not-a-uuid"
# Expected: {"error":"Invalid plan ID"}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/v1/raid-plans/[id]/route.ts
git commit -m "feat(api): add GET /api/v1/raid-plans/:id endpoint"
```

---

## Task 4: OpenAPI registry updates

**Files:**

- Modify: `src/lib/openapi-registry.ts`

- [ ] **Step 1: Add new schemas after `FamilyResponseSchema`**

Add the following after the `FamilyResponseSchema` block (before the `// ─── Paths ───` comment):

```ts
export const EventRoleCountsSchema = registry.register(
  "EventRoleCounts",
  z.object({
    Tank: z.number().openapi({ example: 4 }),
    Healer: z.number().openapi({ example: 9 }),
    Melee: z.number().openapi({ example: 14 }),
    Ranged: z.number().openapi({ example: 15 }),
  }),
);

export const EventExistingPlanSchema = registry.register(
  "EventExistingPlan",
  z.object({
    id: z
      .string()
      .uuid()
      .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    lastModifiedAt: z.string().openapi({ example: "2026-04-29T22:00:00.000Z" }),
  }),
);

export const EventSchema = registry.register(
  "Event",
  z.object({
    id: z.string().openapi({ example: "1234567890" }),
    title: z.string().openapi({ example: "Temple MC {eventtime#E MM/dd}" }),
    displayTitle: z.string().openapi({ example: "Temple MC Tue 04/29" }),
    startTime: z.number().openapi({
      example: 1747180800,
      description: "Unix timestamp (seconds)",
    }),
    signUpCount: z.number().openapi({ example: 42 }),
    roleCounts: EventRoleCountsSchema,
    existingPlan: EventExistingPlanSchema.nullable().openapi({ example: null }),
  }),
);

export const RaidPlanSummarySchema = registry.register(
  "RaidPlanSummary",
  z.object({
    id: z
      .string()
      .uuid()
      .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    name: z.string().openapi({ example: "MC Tuesday" }),
    zoneId: z.string().openapi({ example: "moltencore" }),
    raidHelperEventId: z.string().nullable().openapi({ example: "1234567890" }),
    startAt: z
      .string()
      .nullable()
      .openapi({ example: "2026-04-29T23:00:00.000Z" }),
    isPublic: z.boolean().nullable().openapi({ example: false }),
    lastModifiedAt: z.string().openapi({ example: "2026-04-28T14:30:00.000Z" }),
  }),
);

const PlanCharacterSchema = z.object({
  id: z.string().uuid().openapi({ example: "char-plan-uuid" }),
  characterId: z.number().nullable().openapi({ example: 12345 }),
  characterName: z.string().openapi({ example: "Khlav" }),
  class: z.string().nullable().openapi({ example: "Warrior" }),
  defaultGroup: z.number().nullable().openapi({ example: 0 }),
  defaultPosition: z.number().nullable().openapi({ example: 0 }),
});

const EncounterGroupSchema = z.object({
  id: z.string().uuid().openapi({ example: "group-uuid" }),
  groupName: z.string().openapi({ example: "Core Hounds" }),
  sortOrder: z.number().nullable().openapi({ example: 0 }),
});

const EncounterSchema = z.object({
  id: z.string().uuid().openapi({ example: "encounter-uuid" }),
  encounterKey: z.string().nullable().openapi({ example: "lucifron" }),
  encounterName: z.string().openapi({ example: "Lucifron" }),
  sortOrder: z.number().nullable().openapi({ example: 0 }),
  groupId: z.string().uuid().nullable().openapi({ example: null }),
  useDefaultGroups: z.boolean().nullable().openapi({ example: true }),
  aaTemplate: z.string().nullable().openapi({ example: null }),
  useCustomAA: z.boolean().nullable().openapi({ example: false }),
});

const EncounterAssignmentSchema = z.object({
  encounterId: z.string().uuid().openapi({ example: "encounter-uuid" }),
  planCharacterId: z.string().uuid().openapi({ example: "char-plan-uuid" }),
  groupNumber: z.number().nullable().openapi({ example: 1 }),
  position: z.number().nullable().openapi({ example: 2 }),
});

const AASlotAssignmentSchema = z.object({
  id: z.string().uuid().openapi({ example: "slot-uuid" }),
  encounterId: z.string().uuid().nullable().openapi({ example: null }),
  raidPlanId: z.string().uuid().nullable().openapi({ example: "plan-uuid" }),
  planCharacterId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: "char-plan-uuid" }),
  slotName: z.string().openapi({ example: "Main Tank" }),
});

export const RaidPlanDetailSchema = registry.register(
  "RaidPlanDetail",
  RaidPlanSummarySchema.extend({
    defaultAATemplate: z.string().nullable().openapi({ example: null }),
    useDefaultAA: z.boolean().nullable().openapi({ example: true }),
    characters: z.array(PlanCharacterSchema),
    encounterGroups: z.array(EncounterGroupSchema),
    encounters: z.array(EncounterSchema),
    encounterAssignments: z.array(EncounterAssignmentSchema),
    aaSlotAssignments: z.array(AASlotAssignmentSchema),
  }),
);
```

- [ ] **Step 2: Register the three new paths**

Add after the existing `registry.registerPath` for DELETE `/api/v1/characters/{id}/primary`:

```ts
registry.registerPath({
  method: "get",
  path: "/api/v1/events",
  tags: ["Raid Planning"],
  summary: "List upcoming events",
  description:
    "Lists upcoming Discord events from Raid Helper, annotated with whether a raid plan exists. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    query: z.object({
      hoursBack: z.string().optional().openapi({
        example: "0",
        description:
          "Include events that started up to N hours ago. Defaults to 0.",
      }),
    }),
  },
  responses: {
    200: {
      description: "List of upcoming events sorted by startTime ascending",
      content: {
        "application/json": { schema: z.array(EventSchema) },
      },
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    502: { description: "Raid Helper API unavailable" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/raid-plans",
  tags: ["Raid Planning"],
  summary: "List recent raid plans",
  description:
    "Returns recent raid plans sorted by last-modified descending. Thin list — no roster or encounter detail. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    query: z.object({
      limit: z.string().optional().openapi({
        example: "20",
        description: "Number of plans to return. Default 20, max 50.",
      }),
    }),
  },
  responses: {
    200: {
      description: "List of raid plan summaries",
      content: {
        "application/json": { schema: z.array(RaidPlanSummarySchema) },
      },
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/raid-plans/{id}",
  tags: ["Raid Planning"],
  summary: "Get raid plan detail",
  description:
    "Full plan detail including roster, encounters, per-encounter group assignments, and AA slot assignments. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
  },
  responses: {
    200: {
      description: "Full raid plan detail",
      content: {
        "application/json": { schema: RaidPlanDetailSchema },
      },
    },
    400: { description: "Invalid plan ID format" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan not found" },
  },
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm typecheck 2>&1 | head -40
```

Expected: no errors.

- [ ] **Step 4: Verify OpenAPI spec includes new paths**

```bash
curl -s http://localhost:3000/api/v1/openapi.json | jq '.paths | keys'
```

Expected: includes `/api/v1/events`, `/api/v1/raid-plans`, `/api/v1/raid-plans/{id}`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/openapi-registry.ts
git commit -m "feat(api): add Stage 3a OpenAPI schemas and path registrations"
```

---

## Final verification

- [ ] **Run typecheck and lint**

```bash
pnpm check
```

Expected: 0 errors, 0 warnings.

- [ ] **Verify all three endpoints work end-to-end**

```bash
TOKEN="tera_YOUR_TOKEN_HERE"

# Events
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/events | jq 'length'

# Plan list
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/raid-plans | jq '.[0].name'

# Plan detail (use ID from list)
PLAN_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/v1/raid-plans | jq -r '.[0].id')
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/v1/raid-plans/$PLAN_ID" | jq '{name, charCount: (.characters | length)}'

# OpenAPI spec has new paths
curl -s http://localhost:3000/api/v1/openapi.json | jq '[.paths | keys[] | select(startswith("/api/v1/events") or startswith("/api/v1/raid-plans"))]'
```
