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
    slug: z.string().openapi({ example: "khlav-ashkandi-12345" }),
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
        slug: z.string().openapi({ example: "althlav-ashkandi-99" }),
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
        slug: z.string().openapi({ example: "khlav-ashkandi-12345" }),
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
    zoneId: z.string().openapi({ example: "mc" }),
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
  id: z
    .string()
    .uuid()
    .openapi({ example: "b2c3d4e5-f601-7890-abcd-ef1234567890" }),
  characterId: z.number().nullable().openapi({ example: 12345 }),
  characterName: z.string().openapi({ example: "Khlav" }),
  class: z.string().nullable().openapi({ example: "Warrior" }),
  defaultGroup: z.number().nullable().openapi({ example: 0 }),
  defaultPosition: z.number().nullable().openapi({ example: 0 }),
});

const EncounterGroupSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ example: "d4e5f6a7-b8c9-0123-def0-234567890123" }),
  groupName: z.string().openapi({ example: "Core Hounds" }),
  sortOrder: z.number().nullable().openapi({ example: 0 }),
});

const EncounterSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ example: "c3d4e5f6-a7b8-9012-cdef-123456789012" }),
  encounterKey: z.string().nullable().openapi({ example: "lucifron" }),
  encounterName: z.string().openapi({ example: "Lucifron" }),
  sortOrder: z.number().nullable().openapi({ example: 0 }),
  groupId: z.string().uuid().nullable().openapi({ example: null }),
  useDefaultGroups: z.boolean().nullable().openapi({ example: true }),
  aaTemplate: z
    .string()
    .nullable()
    .openapi({
      example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
    }),
  useCustomAA: z.boolean().nullable().openapi({ example: false }),
  availableSlots: z
    .array(z.string())
    .openapi({ example: ["MainTank", "MainTankHeals"] }),
});

const EncounterAssignmentSchema = z.object({
  encounterId: z
    .string()
    .uuid()
    .openapi({ example: "c3d4e5f6-a7b8-9012-cdef-123456789012" }),
  planCharacterId: z
    .string()
    .uuid()
    .openapi({ example: "b2c3d4e5-f601-7890-abcd-ef1234567890" }),
  groupNumber: z.number().nullable().openapi({ example: 1 }),
  position: z.number().nullable().openapi({ example: 2 }),
});

const AASlotAssignmentSchema = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ example: "e5f6a7b8-c9d0-1234-ef01-345678901234" }),
  encounterId: z.string().uuid().nullable().openapi({ example: null }),
  raidPlanId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
  planCharacterId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: "b2c3d4e5-f601-7890-abcd-ef1234567890" }),
  slotName: z.string().openapi({ example: "MainTank" }),
});

export const RaidPlanDetailSchema = registry.register(
  "RaidPlanDetail",
  RaidPlanSummarySchema.extend({
    defaultAATemplate: z.string().nullable().openapi({ example: null }),
    useDefaultAA: z.boolean().nullable().openapi({ example: true }),
    availableSlots: z
      .array(z.string())
      .openapi({ example: ["MainTank", "TranqShot1", "Healer1"] }),
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
    zoneId: z.string().min(1).max(64).openapi({ example: "mc" }),
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
            id: z
              .string()
              .uuid()
              .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
            name: z.string().openapi({ example: "MC Tuesday" }),
            zoneId: z.string().openapi({ example: "mc" }),
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
  method: "patch",
  path: "/api/v1/raid-plans/{id}",
  operationId: "patchRaidPlan",
  tags: ["Raid Planning"],
  summary: "Update plan AA template",
  description:
    "Updates the plan-level default AA template and/or the useDefaultAA flag. All fields are optional — only provided fields are updated. Requires isRaidManager.",
  security: [{ BearerToken: [] }],
  request: {
    params: z.object({
      id: z
        .string()
        .uuid()
        .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            defaultAATemplate: z
              .string()
              .nullable()
              .optional()
              .openapi({
                example:
                  "{skull} {assign:MainTank} :: {assign:MainTankHeals}\n{assign:TranqShot1} {assign:TranqShot2} Tranq",
              }),
            useDefaultAA: z.boolean().optional().openapi({ example: true }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Updated AA template fields",
      content: {
        "application/json": {
          schema: z.object({
            id: z
              .string()
              .uuid()
              .openapi({ example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }),
            defaultAATemplate: z
              .string()
              .nullable()
              .openapi({
                example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
              }),
            useDefaultAA: z.boolean().nullable().openapi({ example: true }),
            availableSlots: z
              .array(z.string())
              .openapi({ example: ["MainTank", "MainTankHeals"] }),
          }),
        },
      },
    },
    400: { description: "Invalid plan ID or request body" },
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
      planCharacterId: z
        .string()
        .uuid()
        .openapi({ example: "b2c3d4e5-f601-7890-abcd-ef1234567890" }),
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
      planCharacterId: z
        .string()
        .uuid()
        .openapi({ example: "b2c3d4e5-f601-7890-abcd-ef1234567890" }),
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
      encounterId: z
        .string()
        .uuid()
        .openapi({ example: "c3d4e5f6-a7b8-9012-cdef-123456789012" }),
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
      encounterId: z
        .string()
        .uuid()
        .openapi({ example: "c3d4e5f6-a7b8-9012-cdef-123456789012" }),
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
      slotName: z.string().min(1).max(128).openapi({ example: "MainTank" }),
      planCharacterId: z
        .string()
        .uuid()
        .openapi({ example: "b2c3d4e5-f601-7890-abcd-ef1234567890" }),
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
    .openapi({
      example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
    }),
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
  defaultAATemplate: z
    .string()
    .nullable()
    .openapi({
      example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
    }),
  availableSlots: z
    .array(z.string())
    .openapi({ example: ["MainTank", "MainTankHeals"] }),
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
              .openapi({
                example:
                  "{skull} {assign:MainTank} :: {assign:MainTankHeals}\n{assign:TranqShot1} {assign:TranqShot2} Tranq",
              }),
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
              .openapi({
                example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
              }),
            availableSlots: z
              .array(z.string())
              .openapi({ example: ["MainTank", "MainTankHeals"] }),
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
            aaTemplate: z
              .string()
              .optional()
              .openapi({
                example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
              }),
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
              .openapi({
                example: "{skull} {assign:MainTank} :: {assign:MainTankHeals}",
              }),
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
