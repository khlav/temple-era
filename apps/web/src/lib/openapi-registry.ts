import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

// Must be called once before any .openapi({}) calls. Mutates global z instance.
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// Register security scheme
registry.registerComponent("securitySchemes", "BearerToken", {
  type: "http",
  scheme: "bearer",
  description: "Personal API token generated from your profile page",
});

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const CharacterSchema = registry.register(
  "Character",
  z.object({
    characterId: z.number().openapi({ example: 12345 }),
    name: z.string().openapi({ example: "Khlav" }),
    class: z.string().openapi({ example: "Warrior" }),
    server: z.string().openapi({ example: "Ashkandi" }),
    slug: z.string().openapi({ example: "khlav" }),
    classDetail: z.string().openapi({ example: "Warrior - Arms" }),
    isPrimary: z.boolean().nullable().openapi({ example: true }),
    primaryCharacterId: z.number().nullable().openapi({ example: null }),
    primaryCharacterName: z.string().nullable().openapi({ example: null }),
  }),
);

export const CharacterDetailSchema = registry.register(
  "CharacterDetail",
  CharacterSchema.extend({
    secondaryCharacters: z.array(
      z.object({
        characterId: z.number().openapi({ example: 99 }),
        name: z.string().openapi({ example: "Althlav" }),
        class: z.string().openapi({ example: "Rogue" }),
        server: z.string().openapi({ example: "Ashkandi" }),
        slug: z.string().openapi({ example: "althlav" }),
        classDetail: z.string().openapi({ example: "Rogue - Combat" }),
      }),
    ),
    isIgnored: z.boolean().openapi({ example: false }),
  }),
);

export const AttendanceRaidSchema = registry.register(
  "AttendanceRaid",
  z.object({
    raidId: z.number().openapi({ example: 1001 }),
    name: z.string().openapi({ example: "MC Tuesday" }),
    date: z.string().openapi({ example: "2024-01-15" }),
    zone: z.string().openapi({ example: "Molten Core" }),
    attendanceWeight: z.number().openapi({ example: 1 }),
    attendeeOrBench: z
      .enum(["attendee", "bench"])
      .nullable()
      .openapi({ example: "attendee" }),
  }),
);

export const AttendanceSchema = registry.register(
  "Attendance",
  z.object({
    characterId: z.number().openapi({ example: 12345 }),
    characterName: z.string().openapi({ example: "Khlav" }),
    attendancePct: z.number().openapi({ example: 0.83 }),
    weeksTracked: z.number().openapi({ example: 6 }),
    raids: z.array(AttendanceRaidSchema),
  }),
);

export const MeSchema = registry.register(
  "Me",
  z.object({
    id: z.string().openapi({ example: "123456789012345678" }),
    name: z.string().nullable().openapi({ example: "Khlav" }),
    image: z
      .string()
      .nullable()
      .openapi({ example: "https://cdn.discordapp.com/avatars/..." }),
    isRaidManager: z.boolean().nullable().openapi({ example: false }),
    isAdmin: z.boolean().nullable().openapi({ example: false }),
    character: z
      .object({
        characterId: z.number().openapi({ example: 12345 }),
        name: z.string().openapi({ example: "Khlav" }),
        class: z.string().openapi({ example: "Warrior" }),
        primaryCharacterId: z.number().nullable().openapi({ example: null }),
        slug: z.string().openapi({ example: "khlav" }),
        classDetail: z.string().openapi({ example: "Warrior - Arms" }),
      })
      .nullable()
      .openapi({ example: null }),
  }),
);

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
        server: z.string().openapi({ example: "Ashkandi" }),
      }),
    ),
  }),
);

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
  availableSlots: z
    .array(z.string())
    .openapi({ example: ["Main Tank", "Tranq 1"] }),
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

export const CreatePlanSchema = registry.register(
  "CreatePlan",
  z.object({
    raidHelperEventId: z.string().min(1).openapi({ example: "1234567890" }),
    name: z.string().min(1).max(256).openapi({ example: "MC Tuesday" }),
    zoneId: z.string().min(1).max(64).openapi({ example: "moltencore" }),
    startAt: z
      .string()
      .nullable()
      .optional()
      .openapi({ example: "2026-04-29T23:00:00Z" }),
    cloneFromPlanId: z
      .string()
      .uuid()
      .nullable()
      .optional()
      .openapi({ example: null }),
  }),
);

export const SyncSignupsSchema = registry.register(
  "SyncSignups",
  z.object({
    mode: z
      .enum(["addNewSignupsToBench", "fullReimport"])
      .default("addNewSignupsToBench")
      .openapi({
        description:
          "addNewSignupsToBench: adds new signups as benched, never removes existing. fullReimport: replaces roster completely.",
        example: "addNewSignupsToBench",
      }),
  }),
);

// ─── Paths ────────────────────────────────────────────────────────────────────

registry.registerPath({
  method: "get",
  path: "/api/v1/characters",
  operationId: "listCharacters",
  tags: ["Characters"],
  summary: "List characters",
  description:
    "Search and list guild characters. Excludes ignored characters. Results capped at 200.",
  security: [{ BearerToken: [] }],
  request: {
    query: z.object({
      q: z.string().optional().openapi({ example: "Khlav" }),
      type: z.enum(["all", "primary", "secondary"]).optional().openapi({
        description: "Filter by character type. Defaults to all.",
        default: "all",
      }),
    }),
  },
  responses: {
    200: {
      description: "List of characters",
      content: {
        "application/json": { schema: z.array(CharacterSchema) },
      },
    },
    401: { description: "Invalid or missing API token" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/characters/{id}",
  operationId: "getCharacter",
  tags: ["Characters"],
  summary: "Get character by ID",
  description:
    "Returns character by ID. Ignored characters can be retrieved by ID even though they are excluded from the list endpoint.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ example: "12345" }),
    }),
  },
  responses: {
    200: {
      description: "Character detail",
      content: {
        "application/json": { schema: CharacterDetailSchema },
      },
    },
    401: { description: "Invalid or missing API token" },
    404: { description: "Character not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/characters/{id}/attendance",
  operationId: "getCharacterAttendance",
  tags: ["Characters"],
  summary: "Get character attendance",
  description:
    "Returns 6-week rolling attendance for a character's primary family. Resolves secondary characters to their primary automatically.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z.string().openapi({ example: "12345" }),
    }),
  },
  responses: {
    200: {
      description: "Character attendance",
      content: {
        "application/json": { schema: AttendanceSchema },
      },
    },
    401: { description: "Invalid or missing API token" },
    404: { description: "Character not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/me",
  operationId: "getMe",
  tags: ["User"],
  summary: "Get current user",
  description:
    "Returns the authenticated user's profile and linked character (if any)",
  security: [{ BearerToken: [] }],
  responses: {
    200: {
      description: "Current user",
      content: {
        "application/json": { schema: MeSchema },
      },
    },
    401: { description: "Invalid or missing API token" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/openapi.json",
  operationId: "getOpenApiSpec",
  tags: ["Meta"],
  summary: "OpenAPI specification",
  description: "Returns the OpenAPI 3.0 specification for the Temple Raids API",
  responses: {
    200: {
      description: "OpenAPI specification document",
      content: {
        "application/json": { schema: z.record(z.string(), z.unknown()) },
      },
    },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/characters/{id}/secondaries",
  operationId: "setSecondaryCharacters",
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
  operationId: "unlinkCharacterFromPrimary",
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
      description:
        "Character is not a secondary — standalone characters and primary characters cannot be unlinked",
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager or admin" },
    404: { description: "Character not found" },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events",
  operationId: "listEvents",
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
  operationId: "listRaidPlans",
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
  method: "post",
  path: "/api/v1/raid-plans",
  operationId: "createRaidPlan",
  tags: ["Raid Planning"],
  summary: "Create raid plan",
  description:
    "Creates a new raid plan shell for a Raid Helper event. Applies encounter structure from cloneFromPlanId (if provided) or from the active zone template. Roster is empty — use sync-signups after creation. Returns 409 if a plan already exists for the event. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    body: {
      content: {
        "application/json": { schema: CreatePlanSchema },
      },
    },
  },
  responses: {
    201: {
      description: "Plan created",
      content: {
        "application/json": {
          schema: z.object({
            id: z.string().uuid().openapi({ example: "plan-uuid" }),
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

registry.registerPath({
  method: "get",
  path: "/api/v1/raid-plans/{id}",
  operationId: "getRaidPlan",
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

registry.registerPath({
  method: "delete",
  path: "/api/v1/raid-plans/{id}",
  operationId: "deleteRaidPlan",
  tags: ["Raid Planning"],
  summary: "Delete raid plan",
  description:
    "Permanently deletes a raid plan and all associated roster, encounters, and AA slot data. Requires isRaidManager.",
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
      description: "Plan deleted",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "Invalid plan ID format" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan not found" },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/raid-plans/{id}/sync-signups",
  operationId: "syncSignups",
  tags: ["Raid Planning"],
  summary: "Sync signups to roster",
  description:
    "Fetches current signups from Raid Helper and refreshes the plan roster. addNewSignupsToBench (default) adds new signups as benched characters without removing existing. fullReimport replaces the roster completely and resets all custom encounter groups. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: {
      required: false,
      content: {
        "application/json": { schema: SyncSignupsSchema },
      },
    },
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
    400: {
      description: "Plan has no linked Raid Helper event, or invalid plan ID",
    },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan not found" },
    502: { description: "Raid Helper API unavailable" },
  },
});

export const RosterPatchSchema = registry.register(
  "RosterPatch",
  z.array(
    z.object({
      planCharacterId: z.string().uuid().openapi({ example: "char-plan-uuid" }),
      group: z.number().int().min(0).max(7).nullable().openapi({ example: 0 }),
      position: z
        .number()
        .int()
        .min(0)
        .max(4)
        .nullable()
        .openapi({ example: 2 }),
    }),
  ),
);

export const RosterCharacterPatchSchema = registry.register(
  "RosterCharacterPatch",
  z.object({
    characterId: z.number().int().openapi({ example: 456 }),
  }),
);

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/roster",
  operationId: "patchRoster",
  tags: ["Raid Planning"],
  summary: "Bulk patch default roster positions",
  description:
    "Bulk-patches defaultGroup/defaultPosition for multiple characters in a single transaction. Characters not listed are untouched. IDs not belonging to this plan are silently skipped. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: {
      content: {
        "application/json": { schema: RosterPatchSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Number of characters updated",
      content: {
        "application/json": {
          schema: z.object({
            updated: z.number().openapi({ example: 12 }),
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

registry.registerPath({
  method: "patch",
  path: "/api/v1/raid-plans/{id}/roster/{planCharacterId}",
  operationId: "relinkRosterSlot",
  tags: ["Raid Planning"],
  summary: "Re-link roster slot to a DB character",
  description:
    "Updates the character link on a single roster slot. Use to resolve an ambiguous signup match — bind a write-in to a specific DB character. Requires isRaidManager.",
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
      content: {
        "application/json": { schema: RosterCharacterPatchSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "characterId not found in DB" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Plan or roster slot not found" },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/encounters/{encounterId}",
  operationId: "updateEncounter",
  tags: ["Raid Planning"],
  summary: "Update encounter settings",
  description:
    "Partial update for a single encounter. When aaTemplate changes, orphaned AA slot assignments are removed. When useDefaultGroups transitions true→false, seeds encounter assignments from current default groups if none exist yet. Requires isRaidManager.",
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
      content: {
        "application/json": {
          schema: z.object({
            useDefaultGroups: z
              .boolean()
              .optional()
              .openapi({ example: false }),
            encounterName: z
              .string()
              .optional()
              .openapi({ example: "Lucifron" }),
            aaTemplate: z
              .string()
              .nullable()
              .optional()
              .openapi({ example: null }),
            useCustomAA: z.boolean().optional().openapi({ example: true }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Success",
      content: {
        "application/json": {
          schema: z.object({ success: z.boolean().openapi({ example: true }) }),
        },
      },
    },
    400: { description: "No fields provided, or validation error" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Encounter not found or does not belong to this plan" },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/encounters/{encounterId}/roster",
  operationId: "patchEncounterRoster",
  tags: ["Raid Planning"],
  summary: "Bulk patch encounter group assignments",
  description:
    "Bulk-patches per-encounter group assignments. Upserts by (encounterId, planCharacterId) — update if row exists, insert otherwise. Only applies when useDefaultGroups=false on the encounter. Requires isRaidManager.",
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
      content: {
        "application/json": { schema: RosterPatchSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Number of assignments upserted",
      content: {
        "application/json": {
          schema: z.object({
            updated: z.number().openapi({ example: 8 }),
          }),
        },
      },
    },
    400: { description: "Validation error" },
    401: { description: "Invalid or missing API token" },
    403: { description: "Not a raid manager" },
    404: { description: "Encounter not found or does not belong to this plan" },
  },
});

export const AASlotAssignRequestSchema = registry.register(
  "AASlotAssignRequest",
  z.array(
    z.object({
      slotName: z.string().min(1).max(128).openapi({ example: "Main Tank" }),
      planCharacterId: z.string().uuid().openapi({ example: "char-plan-uuid" }),
      encounterId: z.string().uuid().nullable().openapi({
        example: null,
        description:
          "null = plan-level default slot; uuid = encounter-specific slot",
      }),
    }),
  ),
);

registry.registerPath({
  method: "put",
  path: "/api/v1/raid-plans/{id}/aa-slots",
  operationId: "assignAASlots",
  tags: ["Raid Planning"],
  summary: "Bulk assign characters to AA slots",
  description:
    "Merge semantics: upserts by (slotName, encounterId, planCharacterId). Slots not mentioned are untouched. encounterId=null means plan-level default AA slot. Runs serially to preserve sortOrder correctness. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: {
      content: {
        "application/json": { schema: AASlotAssignRequestSchema },
      },
    },
  },
  responses: {
    200: {
      description: "Counts of assigned and skipped slots",
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

// ─── Document builder ─────────────────────────────────────────────────────────

export function buildOpenApiSpec() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      title: "Temple Raids API",
      version: "1.0.0",
      description: "External API for Temple guild raid management",
    },
    servers: [{ url: "https://www.temple-era.com" }],
  });
}
