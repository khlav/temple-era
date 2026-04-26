# Zone Template Management API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 10 REST endpoints under `/api/v1/zone-templates` that expose full zone template CRUD (active toggle, default AA template, encounters, encounter groups, and reordering) with parity to the `/raid-manager/raid-planner/config` UI.

**Architecture:** All routes live under `src/app/api/v1/zone-templates/`. A shared `_helpers.ts` in that directory owns zone validation, template upsert logic, and ownership checks — keeping each route file focused on HTTP concerns only. Zones are hardcoded in `RAID_ZONE_CONFIG`; the `raidPlanTemplates` record is auto-upserted on first write.

**Tech Stack:** Next.js 15 App Router route handlers, Drizzle ORM, Zod, `@asteasolutions/zod-to-openapi`

---

## File Map

| File                                                                       | Action | Responsibility                                         |
| -------------------------------------------------------------------------- | ------ | ------------------------------------------------------ |
| `src/app/api/v1/zone-templates/_helpers.ts`                                | Create | Zone validation, template upsert, ownership checks     |
| `src/app/api/v1/zone-templates/route.ts`                                   | Create | `GET` — list all zones                                 |
| `src/app/api/v1/zone-templates/[zoneId]/route.ts`                          | Create | `GET` detail, `PATCH`                                  |
| `src/app/api/v1/zone-templates/[zoneId]/encounters/route.ts`               | Create | `POST` add encounter                                   |
| `src/app/api/v1/zone-templates/[zoneId]/encounters/reorder/route.ts`       | Create | `POST` atomic bulk reorder                             |
| `src/app/api/v1/zone-templates/[zoneId]/encounters/[encounterId]/route.ts` | Create | `PUT`, `DELETE`                                        |
| `src/app/api/v1/zone-templates/[zoneId]/groups/route.ts`                   | Create | `POST` create group                                    |
| `src/app/api/v1/zone-templates/[zoneId]/groups/[groupId]/route.ts`         | Create | `PUT`, `DELETE`                                        |
| `src/lib/openapi-registry.ts`                                              | Modify | Register all 10 endpoints under `"Zone Templates"` tag |

---

## Task 1: Shared helpers

**Files:**

- Create: `src/app/api/v1/zone-templates/_helpers.ts`

- [ ] **Step 1: Create the helpers file**

```typescript
// src/app/api/v1/zone-templates/_helpers.ts
import { and, eq } from "drizzle-orm";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { getGroupCount } from "~/components/raid-planner/constants";
import { db } from "~/server/db";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getZoneConfig(zoneId: string) {
  return RAID_ZONE_CONFIG.find((z) => z.instance === zoneId) ?? null;
}

export async function upsertZoneTemplate(zoneId: string, createdById: string) {
  const zoneConfig = getZoneConfig(zoneId);
  if (!zoneConfig) throw new Error(`Unknown zone: ${zoneId}`);
  const sortOrder = RAID_ZONE_CONFIG.findIndex((z) => z.instance === zoneId);
  const result = await db
    .insert(raidPlanTemplates)
    .values({
      zoneId,
      zoneName: zoneConfig.name,
      defaultGroupCount: getGroupCount(zoneId),
      isActive: true,
      sortOrder,
      createdById,
    })
    .onConflictDoUpdate({
      target: raidPlanTemplates.zoneId,
      set: { zoneName: zoneConfig.name },
    })
    .returning({ id: raidPlanTemplates.id });
  return result[0]!;
}

export async function getTemplateByZoneId(zoneId: string) {
  const result = await db
    .select({ id: raidPlanTemplates.id })
    .from(raidPlanTemplates)
    .where(eq(raidPlanTemplates.zoneId, zoneId))
    .limit(1);
  return result[0] ?? null;
}

export async function validateEncounterOwnership(
  encounterId: string,
  templateId: string,
) {
  const result = await db
    .select({ id: raidPlanTemplateEncounters.id })
    .from(raidPlanTemplateEncounters)
    .where(
      and(
        eq(raidPlanTemplateEncounters.id, encounterId),
        eq(raidPlanTemplateEncounters.templateId, templateId),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}

export async function validateGroupOwnership(
  groupId: string,
  templateId: string,
) {
  const result = await db
    .select({ id: raidPlanTemplateEncounterGroups.id })
    .from(raidPlanTemplateEncounterGroups)
    .where(
      and(
        eq(raidPlanTemplateEncounterGroups.id, groupId),
        eq(raidPlanTemplateEncounterGroups.templateId, templateId),
      ),
    )
    .limit(1);
  return result[0] ?? null;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/_helpers.ts
git commit -m "feat(api): add zone template route helpers"
```

---

## Task 2: GET /api/v1/zone-templates (list all)

**Files:**

- Create: `src/app/api/v1/zone-templates/route.ts`

- [ ] **Step 1: Create the list route**

```typescript
// src/app/api/v1/zone-templates/route.ts
import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { RAID_ZONE_CONFIG } from "~/lib/raid-zones";
import { getGroupCount } from "~/components/raid-planner/constants";
import { db } from "~/server/db";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";

export async function GET(request: Request) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const templates = await db
      .select({
        id: raidPlanTemplates.id,
        zoneId: raidPlanTemplates.zoneId,
        isActive: raidPlanTemplates.isActive,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      })
      .from(raidPlanTemplates);

    if (templates.length === 0) {
      return NextResponse.json(
        RAID_ZONE_CONFIG.map((zone) => ({
          zoneId: zone.instance,
          zoneName: zone.name,
          defaultGroupCount: getGroupCount(zone.instance),
          template: null,
        })),
      );
    }

    const templateIds = templates.map((t) => t.id);

    const [encounters, groups] = await Promise.all([
      db
        .select({
          id: raidPlanTemplateEncounters.id,
          templateId: raidPlanTemplateEncounters.templateId,
          encounterKey: raidPlanTemplateEncounters.encounterKey,
          encounterName: raidPlanTemplateEncounters.encounterName,
          sortOrder: raidPlanTemplateEncounters.sortOrder,
          groupId: raidPlanTemplateEncounters.groupId,
          aaTemplate: raidPlanTemplateEncounters.aaTemplate,
        })
        .from(raidPlanTemplateEncounters)
        .where(inArray(raidPlanTemplateEncounters.templateId, templateIds)),
      db
        .select({
          id: raidPlanTemplateEncounterGroups.id,
          templateId: raidPlanTemplateEncounterGroups.templateId,
          groupName: raidPlanTemplateEncounterGroups.groupName,
          sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
        })
        .from(raidPlanTemplateEncounterGroups)
        .where(
          inArray(raidPlanTemplateEncounterGroups.templateId, templateIds),
        ),
    ]);

    const encountersByTemplate = new Map<string, typeof encounters>();
    for (const enc of encounters) {
      const list = encountersByTemplate.get(enc.templateId) ?? [];
      list.push(enc);
      encountersByTemplate.set(enc.templateId, list);
    }

    const groupsByTemplate = new Map<string, typeof groups>();
    for (const g of groups) {
      const list = groupsByTemplate.get(g.templateId) ?? [];
      list.push(g);
      groupsByTemplate.set(g.templateId, list);
    }

    const templateByZoneId = new Map(
      templates.map((t) => [
        t.zoneId,
        {
          id: t.id,
          isActive: t.isActive,
          defaultAATemplate: t.defaultAATemplate,
          encounters: encountersByTemplate.get(t.id) ?? [],
          encounterGroups: groupsByTemplate.get(t.id) ?? [],
        },
      ]),
    );

    return NextResponse.json(
      RAID_ZONE_CONFIG.map((zone) => ({
        zoneId: zone.instance,
        zoneName: zone.name,
        defaultGroupCount: getGroupCount(zone.instance),
        template: templateByZoneId.get(zone.instance) ?? null,
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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/route.ts
git commit -m "feat(api): add GET /api/v1/zone-templates"
```

---

## Task 3: GET + PATCH /api/v1/zone-templates/:zoneId

**Files:**

- Create: `src/app/api/v1/zone-templates/[zoneId]/route.ts`

- [ ] **Step 1: Create the zone detail + patch route**

```typescript
// src/app/api/v1/zone-templates/[zoneId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { getSlotNames } from "~/lib/aa-template";
import { getGroupCount } from "~/components/raid-planner/constants";
import { db } from "~/server/db";
import {
  raidPlanTemplates,
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { getZoneConfig, upsertZoneTemplate } from "../_helpers";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId } = await params;
    const zoneConfig = getZoneConfig(zoneId);
    if (!zoneConfig) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    const template = await db
      .select({
        id: raidPlanTemplates.id,
        isActive: raidPlanTemplates.isActive,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      })
      .from(raidPlanTemplates)
      .where(eq(raidPlanTemplates.zoneId, zoneId))
      .limit(1);

    if (template.length === 0) {
      return NextResponse.json({
        zoneId,
        zoneName: zoneConfig.name,
        defaultGroupCount: getGroupCount(zoneId),
        template: null,
      });
    }

    const t = template[0]!;
    const [encounters, groups] = await Promise.all([
      db
        .select({
          id: raidPlanTemplateEncounters.id,
          encounterKey: raidPlanTemplateEncounters.encounterKey,
          encounterName: raidPlanTemplateEncounters.encounterName,
          sortOrder: raidPlanTemplateEncounters.sortOrder,
          groupId: raidPlanTemplateEncounters.groupId,
          aaTemplate: raidPlanTemplateEncounters.aaTemplate,
        })
        .from(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.templateId, t.id))
        .orderBy(raidPlanTemplateEncounters.sortOrder),
      db
        .select({
          id: raidPlanTemplateEncounterGroups.id,
          groupName: raidPlanTemplateEncounterGroups.groupName,
          sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
        })
        .from(raidPlanTemplateEncounterGroups)
        .where(eq(raidPlanTemplateEncounterGroups.templateId, t.id))
        .orderBy(raidPlanTemplateEncounterGroups.sortOrder),
    ]);

    return NextResponse.json({
      zoneId,
      zoneName: zoneConfig.name,
      defaultGroupCount: getGroupCount(zoneId),
      template: {
        id: t.id,
        isActive: t.isActive,
        defaultAATemplate: t.defaultAATemplate,
        availableSlots: getSlotNames(t.defaultAATemplate ?? ""),
        encounters,
        encounterGroups: groups,
      },
    });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

const PatchZoneTemplateSchema = z.object({
  isActive: z.boolean().optional(),
  defaultAATemplate: z.string().max(10000).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId } = await params;
    const zoneConfig = getZoneConfig(zoneId);
    if (!zoneConfig) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = PatchZoneTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;
    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: "No fields provided" },
        { status: 400 },
      );
    }

    const { id: templateId } = await upsertZoneTemplate(zoneId, user.id);

    const updates: Partial<{
      isActive: boolean;
      defaultAATemplate: string | null;
    }> = {};
    if (input.isActive !== undefined) updates.isActive = input.isActive;
    if (input.defaultAATemplate !== undefined)
      updates.defaultAATemplate = input.defaultAATemplate;

    const result = await db
      .update(raidPlanTemplates)
      .set(updates)
      .where(eq(raidPlanTemplates.id, templateId))
      .returning({
        id: raidPlanTemplates.id,
        isActive: raidPlanTemplates.isActive,
        defaultAATemplate: raidPlanTemplates.defaultAATemplate,
      });

    const updated = result[0]!;
    return NextResponse.json({
      id: updated.id,
      isActive: updated.isActive,
      defaultAATemplate: updated.defaultAATemplate,
      availableSlots: getSlotNames(updated.defaultAATemplate ?? ""),
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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/[zoneId]/route.ts
git commit -m "feat(api): add GET + PATCH /api/v1/zone-templates/:zoneId"
```

---

## Task 4: POST /api/v1/zone-templates/:zoneId/encounters

**Files:**

- Create: `src/app/api/v1/zone-templates/[zoneId]/encounters/route.ts`

- [ ] **Step 1: Create the add-encounter route**

```typescript
// src/app/api/v1/zone-templates/[zoneId]/encounters/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";
import { db } from "~/server/db";
import { raidPlanTemplateEncounters } from "~/server/db/schema";
import {
  getZoneConfig,
  upsertZoneTemplate,
  validateGroupOwnership,
} from "../../_helpers";

const AddEncounterSchema = z.object({
  encounterName: z.string().min(1).max(256),
  groupId: z.string().uuid().nullable().optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = AddEncounterSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { id: templateId } = await upsertZoneTemplate(zoneId, user.id);

    if (parsed.data.groupId) {
      const group = await validateGroupOwnership(
        parsed.data.groupId,
        templateId,
      );
      if (!group) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
    }

    const maxSortResult = await db
      .select({ maxSort: max(raidPlanTemplateEncounters.sortOrder) })
      .from(raidPlanTemplateEncounters)
      .where(eq(raidPlanTemplateEncounters.templateId, templateId));

    const nextSortOrder = (maxSortResult[0]?.maxSort ?? -1) + 1;

    const newEncounter = await db
      .insert(raidPlanTemplateEncounters)
      .values({
        templateId,
        encounterKey: slugifyEncounterName(parsed.data.encounterName),
        encounterName: parsed.data.encounterName,
        sortOrder: nextSortOrder,
        groupId: parsed.data.groupId ?? null,
      })
      .returning({
        id: raidPlanTemplateEncounters.id,
        encounterKey: raidPlanTemplateEncounters.encounterKey,
        encounterName: raidPlanTemplateEncounters.encounterName,
        sortOrder: raidPlanTemplateEncounters.sortOrder,
        groupId: raidPlanTemplateEncounters.groupId,
      });

    return NextResponse.json(newEncounter[0]!, { status: 201 });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/[zoneId]/encounters/route.ts
git commit -m "feat(api): add POST /api/v1/zone-templates/:zoneId/encounters"
```

---

## Task 5: PUT + DELETE /api/v1/zone-templates/:zoneId/encounters/:encounterId

**Files:**

- Create: `src/app/api/v1/zone-templates/[zoneId]/encounters/[encounterId]/route.ts`

- [ ] **Step 1: Create the encounter update/delete route**

```typescript
// src/app/api/v1/zone-templates/[zoneId]/encounters/[encounterId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { slugifyEncounterName } from "~/server/api/helpers/raid-plan-helpers";
import { db } from "~/server/db";
import { raidPlanTemplateEncounters } from "~/server/db/schema";
import {
  UUID_RE,
  getZoneConfig,
  getTemplateByZoneId,
  validateEncounterOwnership,
} from "../../../_helpers";

const UpdateEncounterSchema = z.object({
  encounterName: z.string().min(1).max(256).optional(),
  aaTemplate: z.string().max(10000).nullable().optional(),
  sortOrder: z.number().int().optional(),
  groupId: z.string().uuid().nullable().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ zoneId: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, encounterId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(encounterId)) {
      return NextResponse.json(
        { error: "Invalid encounter ID" },
        { status: 400 },
      );
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const encounter = await validateEncounterOwnership(
      encounterId,
      template.id,
    );
    if (!encounter) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
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
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const input = parsed.data;
    if (Object.keys(input).length === 0) {
      return NextResponse.json(
        { error: "No fields provided" },
        { status: 400 },
      );
    }

    const updates: Partial<{
      encounterName: string;
      encounterKey: string;
      aaTemplate: string | null;
      sortOrder: number;
      groupId: string | null;
    }> = {};
    if (input.encounterName !== undefined) {
      updates.encounterName = input.encounterName;
      updates.encounterKey = slugifyEncounterName(input.encounterName);
    }
    if (input.aaTemplate !== undefined) updates.aaTemplate = input.aaTemplate;
    if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
    if (input.groupId !== undefined) updates.groupId = input.groupId;

    await db
      .update(raidPlanTemplateEncounters)
      .set(updates)
      .where(eq(raidPlanTemplateEncounters.id, encounterId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ zoneId: string; encounterId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, encounterId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(encounterId)) {
      return NextResponse.json(
        { error: "Invalid encounter ID" },
        { status: 400 },
      );
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    const encounter = await validateEncounterOwnership(
      encounterId,
      template.id,
    );
    if (!encounter) {
      return NextResponse.json(
        { error: "Encounter not found" },
        { status: 404 },
      );
    }

    await db
      .delete(raidPlanTemplateEncounters)
      .where(eq(raidPlanTemplateEncounters.id, encounterId));

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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/[zoneId]/encounters/[encounterId]/route.ts
git commit -m "feat(api): add PUT + DELETE /api/v1/zone-templates/:zoneId/encounters/:encounterId"
```

---

## Task 6: POST /api/v1/zone-templates/:zoneId/encounters/reorder

**Files:**

- Create: `src/app/api/v1/zone-templates/[zoneId]/encounters/reorder/route.ts`

Note: This must be a separate `reorder/` directory so Next.js doesn't try to match `"reorder"` as an `encounterId`.

- [ ] **Step 1: Create the reorder route**

```typescript
// src/app/api/v1/zone-templates/[zoneId]/encounters/reorder/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { getZoneConfig, getTemplateByZoneId } from "../../../_helpers";

const ReorderSchema = z.object({
  groups: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
    }),
  ),
  encounters: z.array(
    z.object({
      id: z.string().uuid(),
      sortOrder: z.number().int(),
      groupId: z.string().uuid().nullable(),
    }),
  ),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json(
        { error: "Zone template not configured" },
        { status: 404 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = ReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { groups, encounters } = parsed.data;

    await db.transaction(async (tx) => {
      for (const g of groups) {
        await tx
          .update(raidPlanTemplateEncounterGroups)
          .set({ sortOrder: g.sortOrder })
          .where(eq(raidPlanTemplateEncounterGroups.id, g.id));
      }
      for (const e of encounters) {
        await tx
          .update(raidPlanTemplateEncounters)
          .set({ sortOrder: e.sortOrder, groupId: e.groupId })
          .where(eq(raidPlanTemplateEncounters.id, e.id));
      }
    });

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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/[zoneId]/encounters/reorder/route.ts
git commit -m "feat(api): add POST /api/v1/zone-templates/:zoneId/encounters/reorder"
```

---

## Task 7: POST /api/v1/zone-templates/:zoneId/groups

**Files:**

- Create: `src/app/api/v1/zone-templates/[zoneId]/groups/route.ts`

- [ ] **Step 1: Create the create-group route**

```typescript
// src/app/api/v1/zone-templates/[zoneId]/groups/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, max } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import { getZoneConfig, upsertZoneTemplate } from "../../_helpers";

const CreateGroupSchema = z.object({
  groupName: z.string().min(1).max(256),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ zoneId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = CreateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { id: templateId } = await upsertZoneTemplate(zoneId, user.id);

    const [encounterMaxResult, groupMaxResult] = await Promise.all([
      db
        .select({ maxSort: max(raidPlanTemplateEncounters.sortOrder) })
        .from(raidPlanTemplateEncounters)
        .where(eq(raidPlanTemplateEncounters.templateId, templateId)),
      db
        .select({ maxSort: max(raidPlanTemplateEncounterGroups.sortOrder) })
        .from(raidPlanTemplateEncounterGroups)
        .where(eq(raidPlanTemplateEncounterGroups.templateId, templateId)),
    ]);

    const maxEncounter = encounterMaxResult[0]?.maxSort ?? -1;
    const maxGroup = groupMaxResult[0]?.maxSort ?? -1;
    const nextSortOrder = Math.max(maxEncounter, maxGroup) + 1;

    const newGroup = await db
      .insert(raidPlanTemplateEncounterGroups)
      .values({
        templateId,
        groupName: parsed.data.groupName,
        sortOrder: nextSortOrder,
      })
      .returning({
        id: raidPlanTemplateEncounterGroups.id,
        groupName: raidPlanTemplateEncounterGroups.groupName,
        sortOrder: raidPlanTemplateEncounterGroups.sortOrder,
      });

    return NextResponse.json(newGroup[0]!, { status: 201 });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/[zoneId]/groups/route.ts
git commit -m "feat(api): add POST /api/v1/zone-templates/:zoneId/groups"
```

---

## Task 8: PUT + DELETE /api/v1/zone-templates/:zoneId/groups/:groupId

**Files:**

- Create: `src/app/api/v1/zone-templates/[zoneId]/groups/[groupId]/route.ts`

- [ ] **Step 1: Create the group update/delete route**

```typescript
// src/app/api/v1/zone-templates/[zoneId]/groups/[groupId]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { validateApiToken } from "~/server/api/v1-auth";
import { db } from "~/server/db";
import {
  raidPlanTemplateEncounters,
  raidPlanTemplateEncounterGroups,
} from "~/server/db/schema";
import {
  UUID_RE,
  getZoneConfig,
  getTemplateByZoneId,
  validateGroupOwnership,
} from "../../../_helpers";

const UpdateGroupSchema = z.object({
  groupName: z.string().min(1).max(256),
});

const DeleteModeSchema = z.enum(["promote", "deleteChildren"]);

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ zoneId: string; groupId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, groupId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(groupId)) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const group = await validateGroupOwnership(groupId, template.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = UpdateGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation error", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    await db
      .update(raidPlanTemplateEncounterGroups)
      .set({ groupName: parsed.data.groupName })
      .where(eq(raidPlanTemplateEncounterGroups.id, groupId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("v1 API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ zoneId: string; groupId: string }> },
) {
  try {
    const authResult = await validateApiToken(request);
    if ("error" in authResult) return authResult.error;
    const { user } = authResult;

    if (!user.isRaidManager) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { zoneId, groupId } = await params;
    if (!getZoneConfig(zoneId)) {
      return NextResponse.json({ error: "Zone not found" }, { status: 404 });
    }
    if (!UUID_RE.test(groupId)) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }

    const template = await getTemplateByZoneId(zoneId);
    if (!template) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const group = await validateGroupOwnership(groupId, template.id);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const modeParam = searchParams.get("mode") ?? "promote";
    const modeResult = DeleteModeSchema.safeParse(modeParam);
    if (!modeResult.success) {
      return NextResponse.json(
        { error: "Invalid mode. Use 'promote' or 'deleteChildren'" },
        { status: 400 },
      );
    }

    await db.transaction(async (tx) => {
      if (modeResult.data === "promote") {
        await tx
          .update(raidPlanTemplateEncounters)
          .set({ groupId: null })
          .where(eq(raidPlanTemplateEncounters.groupId, groupId));
      } else {
        await tx
          .delete(raidPlanTemplateEncounters)
          .where(eq(raidPlanTemplateEncounters.groupId, groupId));
      }
      await tx
        .delete(raidPlanTemplateEncounterGroups)
        .where(eq(raidPlanTemplateEncounterGroups.id, groupId));
    });

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

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/v1/zone-templates/[zoneId]/groups/[groupId]/route.ts
git commit -m "feat(api): add PUT + DELETE /api/v1/zone-templates/:zoneId/groups/:groupId"
```

---

## Task 9: OpenAPI registration

**Files:**

- Modify: `src/lib/openapi-registry.ts`

Register all 10 endpoints under the `"Zone Templates"` tag. Add after the last existing `registry.registerPath` block (currently ends around the `assignAASlots` entry).

- [ ] **Step 1: Add the zone template schemas and registrations**

Append the following to `src/lib/openapi-registry.ts` after the last existing `registry.registerPath({...})` block:

```typescript
// ─── Zone Templates ───────────────────────────────────────────────────────────

const ZoneTemplateEncounterSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  encounterKey: z.string().openapi({ example: "patchwerk" }),
  encounterName: z.string().openapi({ example: "Patchwerk" }),
  sortOrder: z.number().int().openapi({ example: 0 }),
  groupId: z.string().uuid().nullable().openapi({ example: null }),
  aaTemplate: z
    .string()
    .nullable()
    .openapi({ example: "{tank}MT\n{healer}H1" }),
});

const ZoneTemplateGroupSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  groupName: z.string().openapi({ example: "Spider Wing" }),
  sortOrder: z.number().int().openapi({ example: 0 }),
});

const ZoneTemplateDetailSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  isActive: z.boolean().openapi({ example: true }),
  defaultAATemplate: z.string().nullable().openapi({ example: "{tank}MT" }),
  availableSlots: z.array(z.string()).openapi({ example: ["tank", "healer"] }),
  encounters: z.array(ZoneTemplateEncounterSchema),
  encounterGroups: z.array(ZoneTemplateGroupSchema),
});

const ZoneRowSchema = z.object({
  zoneId: z.string().openapi({ example: "naxxramas" }),
  zoneName: z.string().openapi({ example: "Naxxramas" }),
  defaultGroupCount: z.number().int().openapi({ example: 8 }),
  template: ZoneTemplateDetailSchema.nullable(),
});

const ZoneIdParam = z.object({
  zoneId: z.string().openapi({ example: "naxxramas" }),
});

const EncounterIdParam = z.object({
  zoneId: z.string().openapi({ example: "naxxramas" }),
  encounterId: z
    .string()
    .uuid()
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

const GroupIdParam = z.object({
  zoneId: z.string().openapi({ example: "naxxramas" }),
  groupId: z
    .string()
    .uuid()
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
});

registry.registerPath({
  method: "get",
  path: "/api/v1/zone-templates",
  operationId: "listZoneTemplates",
  tags: ["Zone Templates"],
  summary: "List all zone templates",
  description:
    "Returns all hardcoded raid zones with their template configuration. Zones without a configured template return template: null. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  responses: {
    200: {
      description: "Zone template list",
      content: {
        "application/json": { schema: z.array(ZoneRowSchema) },
      },
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/zone-templates/{zoneId}",
  operationId: "getZoneTemplate",
  tags: ["Zone Templates"],
  summary: "Get zone template detail",
  description:
    "Returns full zone template detail including encounters and encounter groups. Returns template: null if zone exists but has no template yet. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: { params: ZoneIdParam },
  responses: {
    200: {
      description: "Zone template detail",
      content: {
        "application/json": { schema: ZoneRowSchema },
      },
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone not found" },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/zone-templates/{zoneId}",
  operationId: "patchZoneTemplate",
  tags: ["Zone Templates"],
  summary: "Update zone template",
  description:
    "Updates isActive and/or defaultAATemplate. Auto-creates the template record if it does not exist. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: ZoneIdParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            isActive: z.boolean().optional().openapi({ example: true }),
            defaultAATemplate: z
              .string()
              .max(10000)
              .nullable()
              .optional()
              .openapi({ example: "{tank}MT\n{healer}H1" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated template fields",
      content: {
        "application/json": {
          schema: z.object({
            id: z
              .string()
              .uuid()
              .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
            isActive: z.boolean().openapi({ example: true }),
            defaultAATemplate: z
              .string()
              .nullable()
              .openapi({ example: "{tank}MT" }),
            availableSlots: z.array(z.string()).openapi({ example: ["tank"] }),
          }),
        },
      },
    },
    400: { description: "Invalid zone or request body" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone not found" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/zone-templates/{zoneId}/encounters",
  operationId: "addZoneTemplateEncounter",
  tags: ["Zone Templates"],
  summary: "Add encounter to zone template",
  description:
    "Adds a new encounter preset. Auto-creates the zone template record if needed. sortOrder is appended after the current max. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: ZoneIdParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            encounterName: z
              .string()
              .min(1)
              .max(256)
              .openapi({ example: "Patchwerk" }),
            groupId: z
              .string()
              .uuid()
              .nullable()
              .optional()
              .openapi({ example: null }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Created encounter",
      content: {
        "application/json": { schema: ZoneTemplateEncounterSchema },
      },
    },
    400: { description: "Invalid zone or request body" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone or group not found" },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/zone-templates/{zoneId}/encounters/{encounterId}",
  operationId: "updateZoneTemplateEncounter",
  tags: ["Zone Templates"],
  summary: "Update zone template encounter",
  description:
    "Updates any combination of encounterName, aaTemplate, sortOrder, groupId. Regenerates encounterKey when encounterName changes. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: EncounterIdParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            encounterName: z
              .string()
              .min(1)
              .max(256)
              .optional()
              .openapi({ example: "Patchwerk" }),
            aaTemplate: z
              .string()
              .max(10000)
              .nullable()
              .optional()
              .openapi({ example: "{tank}MT" }),
            sortOrder: z.number().int().optional().openapi({ example: 3 }),
            groupId: z
              .string()
              .uuid()
              .nullable()
              .optional()
              .openapi({ example: null }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "Invalid IDs or request body" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone or encounter not found" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/zone-templates/{zoneId}/encounters/{encounterId}",
  operationId: "deleteZoneTemplateEncounter",
  tags: ["Zone Templates"],
  summary: "Delete zone template encounter",
  description:
    "Permanently deletes the encounter preset. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: { params: EncounterIdParam },
  responses: {
    200: {
      description: "Deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "Invalid IDs" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone or encounter not found" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/zone-templates/{zoneId}/encounters/reorder",
  operationId: "reorderZoneTemplateEncounters",
  tags: ["Zone Templates"],
  summary: "Bulk reorder encounters and groups",
  description:
    "Atomically updates sort orders for groups and encounters, and reassigns encounter groupId values. Both arrays are optional but at least one item must be provided. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: ZoneIdParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            groups: z.array(
              z.object({
                id: z
                  .string()
                  .uuid()
                  .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
                sortOrder: z.number().int().openapi({ example: 0 }),
              }),
            ),
            encounters: z.array(
              z.object({
                id: z
                  .string()
                  .uuid()
                  .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
                sortOrder: z.number().int().openapi({ example: 1 }),
                groupId: z
                  .string()
                  .uuid()
                  .nullable()
                  .openapi({ example: null }),
              }),
            ),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Reordered",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "Invalid zone or request body" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone template not configured" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/zone-templates/{zoneId}/groups",
  operationId: "createZoneTemplateGroup",
  tags: ["Zone Templates"],
  summary: "Create encounter group in zone template",
  description:
    "Creates a new encounter group. sortOrder is appended after the current max across both encounters and groups. Auto-creates the zone template record if needed. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: ZoneIdParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            groupName: z
              .string()
              .min(1)
              .max(256)
              .openapi({ example: "Spider Wing" }),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: "Created group",
      content: {
        "application/json": { schema: ZoneTemplateGroupSchema },
      },
    },
    400: { description: "Invalid zone or request body" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone not found" },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/zone-templates/{zoneId}/groups/{groupId}",
  operationId: "updateZoneTemplateGroup",
  tags: ["Zone Templates"],
  summary: "Rename encounter group",
  description: "Updates the group name. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: GroupIdParam,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            groupName: z
              .string()
              .min(1)
              .max(256)
              .openapi({ example: "Spider Wing" }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "Invalid IDs or request body" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone or group not found" },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/zone-templates/{zoneId}/groups/{groupId}",
  operationId: "deleteZoneTemplateGroup",
  tags: ["Zone Templates"],
  summary: "Delete encounter group",
  description:
    "Deletes a group. mode=promote (default) moves child encounters to top-level; mode=deleteChildren deletes them. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: GroupIdParam,
    query: z.object({
      mode: z
        .enum(["promote", "deleteChildren"])
        .optional()
        .openapi({ example: "promote" }),
    }),
  },
  responses: {
    200: {
      description: "Deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "Invalid IDs or mode" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Zone or group not found" },
  },
});
```

- [ ] **Step 2: Verify typecheck passes**

```bash
pnpm typecheck
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/openapi-registry.ts
git commit -m "feat(api): register zone template endpoints in OpenAPI spec"
```

---

## Final verification

- [ ] **Run full typecheck + lint**

```bash
pnpm check
```

Expected: no errors, no warnings from new files
