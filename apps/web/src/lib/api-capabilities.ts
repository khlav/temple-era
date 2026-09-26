// What data Temple stores and which read surfaces expose it (TEMPLE-125). Lets a caller — the bot —
// tell "Temple doesn't store X" apart from "X exists but isn't readable through this account",
// which a bare OpenAPI document can't say (a domain with no read route simply never appears in it).
//
// This is hand-maintained, so capabilities.test.ts checks it against the real thing: every table in
// the Drizzle schema belongs to exactly one domain, every REST path exists in the spec, every
// GraphQL field exists in the schema, and every SQL table is really granted in a migration.
import { SCOPE, type Scope } from "~/lib/scopes";

export interface CapabilityWrite {
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  /** Scope the caller needs; null when any valid token will do. */
  scope: Scope | null;
}

export interface CapabilityDomain {
  id: string;
  name: string;
  description: string;
  /** Postgres tables (`public.<name>`) that hold this domain's data. Empty for a domain that is
   *  fetched live from an outside service and never stored. */
  tables: string[];
  read: {
    /** `METHOD /path` strings for GET routes. */
    rest: string[];
    /** `Type.field` GraphQL v2 fields. */
    graphql: string[];
    /** Tables (`public.x` / `views.x`) the read-only reporting role can SELECT. */
    sql: string[];
  };
  write: CapabilityWrite[];
  notes?: string;
}

const REPORTING_VIEWS = [
  "views.primary_raid_attendee_map",
  "views.primary_raid_bench_map",
  "views.primary_raid_attendee_and_bench_map",
  "views.tracked_raids_l6lockoutwk",
  "views.tracked_raids_current_lockout",
  "views.all_raids_current_lockout",
  "views.primary_raid_attendance_l6lockoutwk",
  "views.report_dates",
];

export const CAPABILITY_DOMAINS: CapabilityDomain[] = [
  {
    id: "characters",
    name: "Characters",
    description: "The guild roster: characters, their class, and primary/secondary family links.",
    tables: ["character"],
    read: {
      rest: [
        "GET /api/v1/characters",
        "GET /api/v1/characters/by-name",
        "GET /api/v1/characters/{id}",
      ],
      graphql: ["Query.character", "Query.characters", "Query.characterFamilies"],
      sql: ["public.character"],
    },
    write: [
      { method: "DELETE", path: "/api/v1/characters/{id}/primary", scope: SCOPE.CHARACTER_MANAGE },
      { method: "PUT", path: "/api/v1/characters/{id}/secondaries", scope: SCOPE.CHARACTER_MANAGE },
    ],
  },
  {
    id: "raids-and-attendance",
    name: "Raids and attendance",
    description: "Logged raids, their attendees and bench, and the 6-week rolling attendance.",
    tables: ["raid", "raid_log", "raid_log_attendee_map", "raid_bench_map"],
    read: {
      rest: [
        "GET /api/v1/raids",
        "GET /api/v1/raids/{id}",
        "GET /api/v1/characters/{id}/attendance",
      ],
      graphql: ["Query.raids", "Character.attendance", "Character.attendedCount"],
      sql: [
        "public.raid",
        "public.raid_log",
        "public.raid_log_attendee_map",
        "public.raid_bench_map",
        ...REPORTING_VIEWS,
      ],
    },
    write: [
      { method: "POST", path: "/api/v1/raids", scope: SCOPE.RAIDLOG_MANAGE },
      { method: "PATCH", path: "/api/v1/raids/{id}", scope: SCOPE.RAIDLOG_MANAGE },
      { method: "PUT", path: "/api/v1/raids/{id}/bench", scope: SCOPE.RAIDLOG_MANAGE },
    ],
  },
  {
    id: "achievements",
    name: "Achievements",
    description:
      "Season and all-time achievements, their tiers, and which families have earned them.",
    tables: ["season", "achievement", "achievement_tier", "achievement_award"],
    read: {
      rest: [],
      graphql: ["Character.achievements", "CharacterFamily.achievements"],
      sql: [
        "public.season",
        "public.achievement",
        "public.achievement_tier",
        "public.achievement_award",
      ],
    },
    write: [
      { method: "POST", path: "/api/v1/achievements", scope: SCOPE.ACHIEVEMENT_MANAGE },
      { method: "POST", path: "/api/v1/achievements/{id}/grant", scope: SCOPE.ACHIEVEMENT_MANAGE },
    ],
    notes:
      "Awards belong to a character's primary, so a secondary's achievements are its primary's. " +
      "There is no REST read route; use GraphQL or SQL.",
  },
  {
    id: "recipes",
    name: "Recipes and crafting",
    description: "Profession recipes and which characters know them.",
    tables: ["recipes", "character_spells"],
    read: {
      rest: [],
      graphql: ["Query.recipes"],
      sql: ["public.recipes", "public.character_spells"],
    },
    write: [],
  },
  {
    id: "raid-plans",
    name: "Raid plans and templates",
    description: "Raid compositions, encounter assignments and the per-zone plan templates.",
    tables: [
      "raid_plan_template",
      "raid_plan_template_encounter_group",
      "raid_plan_template_encounter",
      "raid_plan",
      "raid_plan_character",
      "raid_plan_encounter_group",
      "raid_plan_encounter",
      "raid_plan_encounter_note",
      "raid_plan_encounter_assignment",
      "raid_plan_encounter_aa_slot",
      "raid_plan_presence",
    ],
    read: {
      rest: [
        "GET /api/v1/raid-plans",
        "GET /api/v1/raid-plans/{id}",
        "GET /api/v1/raid-templates",
        "GET /api/v1/raid-templates/{zoneId}",
      ],
      graphql: [],
      sql: [
        "public.raid_plan_template",
        "public.raid_plan_template_encounter_group",
        "public.raid_plan_template_encounter",
        "public.raid_plan",
        "public.raid_plan_character",
        "public.raid_plan_encounter_group",
        "public.raid_plan_encounter",
        "public.raid_plan_encounter_note",
        "public.raid_plan_encounter_assignment",
        "public.raid_plan_encounter_aa_slot",
      ],
    },
    write: [
      { method: "POST", path: "/api/v1/raid-plans", scope: SCOPE.RAIDPLAN_MANAGE },
      { method: "PATCH", path: "/api/v1/raid-plans/{id}", scope: SCOPE.RAIDPLAN_MANAGE },
    ],
    notes: "raid_plan_presence is live editor presence and is not reportable.",
  },
  {
    id: "world-buffs",
    name: "World buffs",
    description: "Who has which world-buff turn-in ready, and the scheduled turn-ins.",
    tables: ["world_buff_character_status", "world_buff_assignment"],
    read: {
      rest: ["GET /api/v1/world-buffs/status", "GET /api/v1/world-buffs/assignments"],
      graphql: [],
      sql: [],
    },
    write: [
      { method: "POST", path: "/api/v1/world-buffs/status", scope: SCOPE.WORLDBUFF_MANAGE },
      { method: "POST", path: "/api/v1/world-buffs/assignments", scope: SCOPE.WORLDBUFF_MANAGE },
    ],
    notes: "Past turn-ins (`?state=past`) need worldbuff:manage. Not granted to the SQL role.",
  },
  {
    id: "signup-history",
    name: "Signup history",
    description:
      "Periodic snapshots of Raid Helper signups leading up to each raid, and their links to logged raids.",
    tables: [
      "raid_helper_signup_snapshot",
      "raid_helper_signup_snapshot_schedule",
      "raid_signup_snapshot_link",
    ],
    read: { rest: [], graphql: [], sql: [] },
    write: [],
    notes:
      "Stored, and shown on the site's raid detail page, but not readable over REST, GraphQL or SQL. " +
      "Live signups for an upcoming event come from GET /api/v1/scheduled-raids/{eventId}/signups.",
  },
  {
    id: "scheduled-events",
    name: "Scheduled raid events",
    description: "Upcoming Raid Helper events and their signups. Fetched live, never stored.",
    tables: [],
    read: {
      rest: ["GET /api/v1/scheduled-raids", "GET /api/v1/scheduled-raids/{eventId}/signups"],
      graphql: [],
      sql: [],
    },
    write: [],
  },
  {
    id: "softres",
    name: "SoftRes",
    description:
      "Soft-reserve data lives at softres.it and is fetched live; Temple stores no reserve history.",
    tables: [],
    read: { rest: [], graphql: [], sql: [] },
    write: [{ method: "POST", path: "/api/v1/softres", scope: SCOPE.SOFTRES_ACCESS }],
  },
  {
    id: "users-and-access",
    name: "Users, roles and access",
    description: "Site accounts, sessions, API tokens, roles and Discord role bindings.",
    tables: [
      "auth_user",
      "auth_account",
      "auth_session",
      "auth_verification_token",
      "role",
      "user_role",
      "discord_role_binding",
      "discord_pending_role_grant",
      "discord_sync_state",
    ],
    read: {
      rest: ["GET /api/v1/me"],
      graphql: ["Query.users"],
      sql: [],
    },
    write: [{ method: "PATCH", path: "/api/v1/me/templar", scope: null }],
    notes:
      "Deliberately withheld from the SQL role: it holds OAuth tokens, sessions and API-token hashes. " +
      "REST and GraphQL expose only a user's public identity and their linked character.",
  },
];

export interface CapabilityReportDomain {
  id: string;
  name: string;
  description: string;
  /** True when Temple keeps this data in its own database; false for live-fetched domains. */
  stored: boolean;
  /** Whether at least one surface can read it, and which. */
  readable: { rest: boolean; graphql: boolean; sql: boolean; any: boolean };
  read: CapabilityDomain["read"];
  /** Each write route, with whether the calling token's scopes allow it. */
  write: (CapabilityWrite & { allowed: boolean })[];
  notes: string | null;
}

export interface CapabilityReport {
  scopes: Scope[];
  domains: CapabilityReportDomain[];
}

/** The report for one caller. Read access needs only a valid token (the routes that gate reads on a
 *  scope say so in `notes`), so `readable` is the same for everyone; `write[].allowed` is what
 *  varies with the caller's scopes. */
export function buildCapabilityReport(scopes: Scope[]): CapabilityReport {
  return {
    scopes,
    domains: CAPABILITY_DOMAINS.map((domain) => {
      const rest = domain.read.rest.length > 0;
      const graphql = domain.read.graphql.length > 0;
      const sql = domain.read.sql.length > 0;
      return {
        id: domain.id,
        name: domain.name,
        description: domain.description,
        stored: domain.tables.length > 0,
        readable: { rest, graphql, sql, any: rest || graphql || sql },
        read: domain.read,
        write: domain.write.map((w) => ({
          ...w,
          allowed: w.scope === null || scopes.includes(w.scope),
        })),
        notes: domain.notes ?? null,
      };
    }),
  };
}
