# AGENTS.md — `apps/web`

Guidance for coding agents working in the **web app**.

> **Read the root `AGENTS.md` first.** It covers workspace layout, the shared toolchain,
> environment-variable rules, git/commit conventions, and the Templar constraint. This
> file covers only what is specific to `apps/web`.

**Maintenance Rule**: When making changes that affect this app's architecture, structure, commands, database schema, API endpoints, or common patterns, update this file. Workspace-level changes belong in the root `AGENTS.md` instead.

**Running commands**: most have a root alias (`pnpm dev`, `pnpm db:studio`). For
anything without one: `pnpm web <script>`, or `cd apps/web` first.

**Secrets come from Doppler — there is no `.env` here.** One-time setup:

```bash
doppler login && cd apps/web && doppler setup --no-interactive
pnpm dev:doppler
```

`.env.example` remains as documentation of what each variable is for; do not copy
it to `.env`. See the root `AGENTS.md` for the full picture.

## Project Overview

Temple Raids is a comprehensive raid management and attendance tracking system for Temple, a Horde guild on the Ashkandi server in World of Warcraft Classic. Built with the T3 Stack (Next.js 16, tRPC, Drizzle ORM, PostgreSQL), it provides a modern web interface for managing guild raids, tracking attendance over rolling 6-week periods, coordinating crafting resources, and planning raid compositions.

Live at: https://www.temple-era.com

## Development Commands

### Essential Commands

```bash
pnpm dev              # Start development server (Turbopack — the Next 16 default)
pnpm dev:standard     # Start development server on Webpack instead (`next dev --webpack`)
pnpm build            # Build for production
pnpm start            # Start production server
pnpm preview          # Build and start production server locally
```

### Database Commands

```bash
pnpm db:push          # Push schema changes to database (development)
pnpm db:generate      # Generate migration files
pnpm db:migrate       # Run migrations
pnpm db:deploy        # Run migrations + kill idle connections (deploy step)
pnpm db:studio        # Open Drizzle Studio (database GUI)
```

**`db:deploy` is not part of `build`.** Migrations used to run via `postbuild`; Phase 2 of the monorepo migration split them apart so builds never mutate a database. Any deploy pipeline must invoke `db:deploy` explicitly — see the root `AGENTS.md` for the required Vercel Build Command.

### Cloning PROD to DEV

Copies all application data from PROD to DEV. Only app-owned schemas (`public`, `views`, `drizzle`) are dumped — Supabase-managed schemas are excluded entirely.

**Prerequisites:** `pg_dump`, `pg_restore`, and `psql` must be v17 to match the server. Set `DATABASE_PROD_URL` in `.env`.

```bash
pnpm db:clone-prod
```

### Code Quality Commands

```bash
pnpm lint             # Run oxlint
pnpm lint:fix         # Run oxlint with auto-fix
pnpm typecheck        # Run TypeScript type checking
pnpm format           # Check oxfmt formatting
pnpm format:fix       # Fix oxfmt formatting
```

### Pre-commit Hooks

Hooks are managed by **lefthook** from the repo root (`lefthook.yml` + `.lefthook/`) and cover both apps. See the root `AGENTS.md` for the full description.

**Important**: `pnpm db:deploy` runs `drizzle-kit migrate`, which outputs PostgreSQL `NOTICE` messages (e.g., "schema already exists, skipping"). These are **not errors** — they are normal idempotent migration notices. Only check the exit code to determine success.

`pnpm build` compiles only and never touches the database. It does still validate
the environment via `@t3-oss/env-nextjs`, so run it under Doppler:

```bash
pnpm --filter temple-era-web exec doppler run -- pnpm exec next build
```

To compile with no secrets at all (what the pre-push hook does):

```bash
SKIP_ENV_VALIDATION=1 pnpm build
```

That flag is declared in `turbo.json` as `globalPassThroughEnv` — Turborepo 2.x
runs in `strict` env mode and would otherwise filter it out before the task sees it.

## Architecture Overview

### Tech Stack

- **Next.js 16**: React framework with App Router (RSC), Turbopack by default
- **tRPC**: End-to-end typesafe APIs between client and server
- **Drizzle ORM**: Type-safe database operations with PostgreSQL
- **NextAuth.js**: Authentication with Discord OAuth (v5 beta)
- **Tailwind CSS + shadcn/ui**: Styling with Radix UI components
- **TanStack Query**: React Query for data fetching and caching
- **Zod**: Runtime validation and type safety
- **PostHog**: Product analytics (optional, via URL rewrites)
- **dnd-kit**: Drag and drop for raid planning
- **date-fns**: Date manipulation and timezone handling

### Path Aliases

- `~/*` maps to `./src/*`
- `@/components/*` maps to `./src/components/*`

### Project Structure

See `src/` for the directory layout — organized by feature under `components/`,
`server/api/routers/`, `server/db/models/`, `lib/`, `hooks/`, etc.

### Key Architectural Patterns

#### Data Flow

1. **Client-side**: React components use tRPC hooks (`api.router.procedure.useQuery()`)
2. **tRPC Layer**: Type-safe procedures in `src/server/api/routers/`
3. **Database Layer**: Drizzle ORM queries with database views for complex queries
4. **External APIs**: Warcraft Logs (GraphQL), Battle.net (REST), Discord, and Raid Helper via OAuth/API keys

#### Authentication & Authorization

- Discord OAuth via NextAuth.js (v5 beta)
- Session-based authentication
- Scope-based access control with three tRPC procedure types:
  - `publicProcedure` - No authentication required
  - `protectedProcedure` - Requires authenticated user
  - `scopedProcedure(...scopes)` - Requires the session to hold every listed scope
  - `adminProcedure` - Legacy; retained only for `recipe.ts` catalog management
- Permission scopes are defined in `src/lib/scopes.ts` and mirrored by the `scope` Postgres enum.
  Current set: `raidlog:manage`, `raidplan:manage`, `character:manage`, `userpermissions:manage`,
  `templar:access`, `softres:access`, `api-token:access`, `worldbuff:manage`
- Scopes are granted via roles (`role`/`user_role` tables); `resolveUserAccess()` in
  `src/server/services/access-service.ts` is the single chokepoint that resolves a user's
  effective scopes and derives the legacy `isRaidManager`/`isAdmin` compatibility booleans
- Discord user ID is the primary identifier

#### Database Schema

- **Core Tables**: `raids`, `raid_logs`, `characters`, `raid_log_attendee_map`, `raid_bench_map`
- **Raid Planning Tables**: Defined in `raid-plan-schema.ts` for composition planning
- **Character Mapping**: Characters can be linked to a "primary" character for consolidated attendance
- **Database Views**: Complex queries are materialized as views (e.g., `primary_raid_attendance_l6_lockout_wk`)
- **Attendance Calculation**: 6-week rolling window based on raid dates and attendance weights
- `templar_enabled` on `auth_user` — user opt-in for the Templar Discord bot proxy
- `api_token_encrypted` on `auth_user` — AES-256-GCM encrypted copy of the API token, used exclusively by the proxy

#### External API Integration

- **Warcraft Logs (WCL)**: Fetches raid logs via GraphQL API
  - OAuth client credentials flow
  - Queries in `src/server/api/wcl-queries.ts`
  - Helpers in `src/server/api/wcl-helpers.ts`
- **Battle.net**: Fetches character data (configured via OAuth)
- **Discord Bot**: Lives in this monorepo at `apps/bot`; communicates via the REST API endpoints in `src/app/api/discord/`
  - Helper functions in `src/server/api/discord-helpers.ts`
  - Changing any `/api/discord/*` request or response shape is a contract change — update `apps/bot` in the same PR
- **Raid Helper**: Integration for raid scheduling via `RAID_HELPER_API_KEY`. Signup
  history is periodically snapshotted via QStash — see "Scheduled Jobs (QStash)" below

#### Component Patterns

- Server Components by default (Next.js 16 App Router)
- Client Components marked with `"use client"` directive
- Streaming with React Suspense for data fetching
- Skeleton loaders for loading states
- Toast notifications for user feedback
- Drag and drop via dnd-kit for raid planner

#### Search Functionality

- Global quick launcher: Cmd/Ctrl+K to open (context in `src/contexts/global-quick-launcher-context.tsx`)
- Advanced search syntax for recipes: supports OR, AND, profession filters, etc.
- Search implementation in `src/server/api/routers/search.ts`

## Development Workflow

### Branch, commit, and PR rules

See the root `AGENTS.md` — branch naming, commit format, the `/ship` process, and the `user-facing` label are workspace-wide and documented there once.

### Parallel Implementation

When implementing features that span independent layers, consider spawning parallel sub-agents via the Task tool rather than working sequentially. This is most valuable when backend and frontend changes don't depend on each other being completed first.

**When to suggest parallel agents:**

- Feature touches both a tRPC router/Drizzle query **and** a React component or hook
- Schema changes + UI changes that can be designed against a shared interface
- Any task where 2+ files in different areas of the codebase need independent changes

**Typical parallel split for this stack:**

- **Backend agent**: tRPC router (`src/server/api/routers/`), Drizzle schema/queries (`src/server/db/`)
- **Frontend agent**: React components (`src/components/`), hooks (`src/hooks/`), pages (`src/app/`)
- **Types agent** (optional): Shared Zod schemas, TypeScript interfaces that both layers need

After sub-agents complete, validate interface alignment with `pnpm typecheck` before committing.

When proposing a plan for a multi-layer feature, explicitly call out which work can be parallelized and offer to spawn agents for each stream.

#### PR Description Formatting

- Use _italics_ for inline code references instead of backticks (better readability in GitHub)
- Follow the PR template structure
- Be crisp and concise - Keep descriptions brief and to the point
- Focus on key changes - What was added, fixed, or improved (2-4 bullet points max)
- Use bullet points for easy scanning (limit to essential items only)
- Include technical context only when necessary for understanding (avoid implementation details unless critical)
- Keep each template section brief
- Avoid repetition - Don't restate what's already clear from the title or commit message
- User-focused - Prioritize what users will see/experience over technical implementation details

### Environment Setup

**Prerequisites:**

- Node.js 24.x (required: `>=24.0.0 <25.0.0`, `.nvmrc` → 24.18.1)
- pnpm 9.x (`packageManager: pnpm@9.15.1`)

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Generate with `npx auth secret` (optional in dev, required in prod)
- `AUTH_DISCORD_ID` & `AUTH_DISCORD_SECRET` - Discord OAuth
- `WCL_CLIENT_ID`, `WCL_CLIENT_SECRET`, `WCL_OAUTH_URL`, `WCL_API_URL` - Warcraft Logs API
- `BATTLENET_CLIENT_ID`, `BATTLENET_CLIENT_SECRET`, `BATTLENET_OAUTH_URL` - Battle.net API
- `TEMPLE_WEB_API_TOKEN` - For Discord bot integration
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_RAID_LOGS_CHANNEL_ID` - Discord channel for raid logs
- `DISCORD_RAID_SR_CHANNEL_IDS` - Comma-separated SR channel IDs
- `DISCORD_RAID_HELPER_BOT_ID` - Raid Helper bot user ID
- `DISCORD_SERVER_ID` - Discord server/guild ID
- `RAID_HELPER_API_KEY` - Raid Helper API key
- `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` - Upstash QStash (see "Scheduled Jobs (QStash)" below); shared across `dev`/`stg`/`prd`

Optional:

- `NEXT_PUBLIC_POSTHOG_ENABLED` - Enable PostHog analytics ("true")
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog API key
- `NEXT_PUBLIC_APP_URL` - Application URL
- `NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL` - URL to restricted items spreadsheet
- `NEXT_PUBLIC_RAID_POLICY_URL` - Discord link to the raid attendance/loot policy channel
- `GOOGLE_SITE_VERIFICATION` - Google site verification token
- `DISCORD_WEBHOOK_PUBLIC_KEY` - Discord webhook verification
- `DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID` - Excludes this channel from `fetchScheduledEvents()` (see "Scheduled Jobs (QStash)" below) — Raid Helper's events list otherwise returns every event ever posted, unfiltered by age

Environment variables are validated at build time via `@t3-oss/env-nextjs` with Zod. Set `SKIP_ENV_VALIDATION=1` to bypass (useful for Docker builds). See `.env.example` for full list.

### Code Quality Standards

#### TypeScript

- Strict mode enabled with `noUncheckedIndexedAccess`
- Use proper type definitions (avoid `any`)
- Prefer type inference where clear
- Use Zod schemas for validation

#### React

- Prefer functional components with hooks
- Server Components by default, `"use client"` only when needed
- Use React Query/tRPC hooks for data fetching
- Follow existing component patterns

#### Database

- Use Drizzle ORM for all database operations
- Define schemas in `src/server/db/models/`
- Use database views for complex reporting queries
- Prefer transactions for multi-step operations
- Migrations are **not** part of `build` — run them explicitly via `pnpm db:deploy`
  (`drizzle-kit migrate`). See the `db:deploy` note above.

#### Styling

- Use Tailwind CSS utility classes
- Follow shadcn/ui component patterns (config in `components.json`)
- Use class-variance-authority (cva) for component variants
- Responsive design with mobile-first approach

#### API Design

- Use tRPC for internal APIs (client <> server)
- Use Next.js API routes for external integrations (Discord bot)
- Validate all inputs with Zod
- Use proper error handling and meaningful error messages

## Discord Bot Integration

The website provides REST API endpoints for the Discord bot at `apps/bot`:

- `POST /api/discord/create-raid` - Creates raid from WCL URL
- `POST /api/discord/check-permissions` - Checks user permissions
- `POST /api/discord/update-raid` - Updates existing raid data
- `POST /api/discord/update-bench` - Updates raid bench assignments
- `POST /api/discord/proxy/{discordId}` - Proxies a v1 API call on behalf of an opted-in user (requires `templarEnabled = true` on target user)
- All require `Authorization: Bearer {TEMPLE_WEB_API_TOKEN}` header
- Helper functions in `src/server/api/discord-helpers.ts`

**Request and response shapes live in `@temple-era/contracts`** (`packages/contracts`), not in
the route files. Each handler parses its body with the request schema and annotates its 200
payload with the matching `*Result` type, so a shape change that the bot has not been updated
for is a typecheck failure rather than a runtime surprise. `check-permissions` returns `scopes`
in addition to the legacy `isRaidManager` — new consumers should gate on `scopes`; see
`docs/followups/legacy-access-booleans-cleanup.md`.

## External REST API

The website provides a versioned public REST API at `/api/v1/`:

- `GET /api/v1/openapi.json` - OpenAPI 3.0 spec (no auth)
- `GET /api/v1/me` - Authenticated user identity and linked character
- `PATCH /api/v1/me/templar` - Toggle Templar bot opt-in (raid managers/admins only)
- `GET /api/v1/characters` - Search/list characters (query params: `q`, `type`)
- `GET /api/v1/characters/by-name?names=` - Batch exact lookup by name (case + diacritic-insensitive, max 100)
- `GET /api/v1/characters/:id` - Character detail with family
- `GET /api/v1/characters/:id/attendance` - 6-week rolling attendance
- `DELETE /api/v1/characters/:id/primary` - Unlink character from its primary
- `PUT /api/v1/characters/:id/secondaries` - Set secondary characters
- `GET /api/v1/scheduled-raids` - Upcoming Raid Helper events with existing plan annotations
- `GET /api/v1/scheduled-raids/:eventId/signups` - Signups for a scheduled event with character matching and 6-week attendance (handles recurring events)
- `GET /api/v1/raid-plans` - List recent raid plans
- `POST /api/v1/raid-plans` - Create raid plan
- `GET /api/v1/raid-plans/:id` - Plan detail (`?include=encounters,encounterGroups,encounterAssignments,aaSlots`)
- `PATCH /api/v1/raid-plans/:id` - Update plan AA template
- `DELETE /api/v1/raid-plans/:id` - Delete plan
- `PUT /api/v1/raid-plans/:id/roster` - Bulk patch default roster positions
- `PATCH /api/v1/raid-plans/:id/roster/:planCharacterId` - Re-link roster slot to a DB character
- `PUT /api/v1/raid-plans/:id/aa-slots` - Bulk assign AA slots
- `PUT /api/v1/raid-plans/:id/encounters/:encounterId` - Update encounter settings
- `PATCH /api/v1/raid-plans/:id/encounters/:encounterId/roster` - Bulk patch encounter group assignments
- `POST /api/v1/raid-plans/:id/sync-signups` - Sync Raid Helper signups to roster
- `GET /api/v1/raid-templates` - List all raid templates (zone configs)
- `GET /api/v1/raid-templates/:zoneId` - Raid template detail with encounters and groups
- `PATCH /api/v1/raid-templates/:zoneId` - Update raid template
- `POST /api/v1/raid-templates/:zoneId/encounters` - Add encounter
- `PUT /api/v1/raid-templates/:zoneId/encounters/:encounterId` - Update encounter
- `DELETE /api/v1/raid-templates/:zoneId/encounters/:encounterId` - Delete encounter
- `POST /api/v1/raid-templates/:zoneId/encounters/reorder` - Bulk reorder encounters and groups
- `POST /api/v1/raid-templates/:zoneId/groups` - Create encounter group
- `PUT /api/v1/raid-templates/:zoneId/groups/:groupId` - Rename encounter group
- `DELETE /api/v1/raid-templates/:zoneId/groups/:groupId` - Delete encounter group
- `GET /api/v1/world-buffs/status` - List world-buff turn-in status (character×item submissions)
- `POST /api/v1/world-buffs/status` - Submit (create-or-update) a character's availability for an item; requires `worldbuff:manage` (unlike the site's own open self-service form — this path is for bulk/bot imports on someone else's behalf)
- `PATCH /api/v1/world-buffs/status/:id` - Set turn-in state (`ready_to_drop`/`dropped`); requires `worldbuff:manage`
- `GET /api/v1/world-buffs/assignments` - List scheduled turn-ins (`?state=active`, default; `?state=past` requires `worldbuff:manage`, mirroring the tRPC router's own public/gated split)
- `POST /api/v1/world-buffs/assignments` - Schedule a turn-in; requires `worldbuff:manage`
- `PATCH /api/v1/world-buffs/assignments/:id` - Reschedule/re-link a turn-in (partial update); requires `worldbuff:manage`
- `DELETE /api/v1/world-buffs/assignments/:id` - Delete a scheduled turn-in (hard delete, no cancelled state); requires `worldbuff:manage`

### Admin

- `POST /api/v1/admin/connections` - terminate idle Supavisor backends on demand.
  Requires `userpermissions:manage`. The same cleanup runs on every deploy via
  `pnpm db:deploy`; this covers the gap between deploys. Deliberately **not**
  registered in the OpenAPI spec, so the Templar contract is unchanged.

**Auth:** Personal API tokens (`tera_<32-hex>`), generated from the profile page by raid managers and admins. Passed as `Authorization: Bearer <token>`. Tokens are stored as SHA-256 hashes in the DB.

**Key files:**

- `src/server/api/v1-auth.ts` - `validateApiToken()` helper used by all routes
- `src/lib/openapi-registry.ts` - Zod-to-OpenAPI registry and `buildOpenApiSpec()`
- `src/app/api/v1/` - Route handlers

## GraphQL API (v2)

A read-only GraphQL API at `GET|POST /api/v2/graphql`. Uses Pothos (code-first schema builder) + GraphQL Yoga.

**Auth:** Same Bearer token model as v1 (`Authorization: Bearer <token>`). All queries require a valid token.

**GraphiQL:** Available at `/api/v2/graphql` in development.

**Root queries:**
- `users(discordIds: [String!]!)` — look up users by Discord user ID; traverses to linked characters + attendance
- `character(id: Int!)` — single character; primary characters aggregate attendance across full family
- `characterFamily(primaryCharacterId: Int!)` — primary + all secondaries with aggregated attendance
- `characters(type: CharacterType, search: String)` — list non-ignored characters with optional filter
- `raids(zone: RaidZone, limit: Int, offset: Int)` — list raids newest-first with optional zone filter

**Key types:** User, Character, CharacterFamily, Raid, RaidLog, AttendanceReport (with flexible zone + week params)

**Key files:**
- `src/app/api/v2/graphql/route.ts` — Yoga route handler
- `src/server/api/v2/schema.ts` — schema assembly + root Query
- `src/server/api/v2/types/` — Pothos type implementations
- `src/server/api/v2/helpers/attendance.ts` — parameterized attendance computation
- `src/server/api/v2/helpers/lockout-weeks.ts` — Tuesday-anchored WoW lockout week logic

## Scheduled Jobs (QStash)

This app has no in-process scheduler (it's serverless on Vercel) and is on the **Hobby**
plan, which only allows once-daily Vercel Cron — too coarse for anything time-sensitive.
Recurring/delayed work instead goes through **QStash** (Upstash's HTTP-based
scheduling/messaging service), whose Schedules aren't gated by Vercel's plan tier.

- **`POST /api/qstash/raid-helper-discovery`** — QStash-Schedule-triggered (every 30
  min). Polls Raid Helper's event list (`fetchScheduledEvents()` — excludes
  `DISCORD_RAID_HELPER_ARCHIVE_CHANNEL_ID` if set, since Raid Helper's API returns every
  event ever posted with no age limit of its own) and decides, per upcoming raid ×
  checkpoint (daily T-144h through T-24h, plus T-0), whether to schedule a precise one-off capture,
  reschedule one whose raid time changed, capture immediately if overdue-but-within-grace,
  or give up. Decision logic: `src/server/services/raid-helper-snapshot-checkpoints.ts`
  (`decideCheckpointAction`).
- **`POST /api/qstash/raid-helper-capture`** — QStash-message-triggered, fired at a
  single checkpoint's exact target time. Fetches current signups and inserts a snapshot
  row (`src/server/services/raid-helper-snapshot-capture.ts`).
- Both routes verify the inbound request via `verifyQstashRequest`
  (`src/server/services/qstash-verify.ts`), using
  `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`. This is a hand-rolled wrapper
  around `@upstash/qstash`'s `Receiver` rather than the package's own
  `verifySignatureAppRouter` helper — that helper validates its signing keys eagerly at
  the point a route does `export const POST = verifySignatureAppRouter(...)`, which runs
  during `next build`'s page-data-collection step and throws when secrets are absent.
  This repo's CI and pre-push hook both build with `SKIP_ENV_VALIDATION=1` and no
  secrets, so that eager check breaks the build; constructing `Receiver` lazily inside
  the request handler (only evaluated at real request time, in a real deployment where
  secrets are present) avoids it.
  `QSTASH_TOKEN` is used by `src/server/services/qstash-client.ts` (the shared `Client`
  singleton) to publish/cancel messages and manage schedules.
- **`QSTASH_TOKEN`/`QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY` are shared
  across `dev`/`stg`/`prd`** (same QStash account for all three, same pattern as
  `RAID_HELPER_API_KEY`/`DISCORD_SERVER_ID`) — the per-environment isolation boundary is
  each environment's destination URL and its own QStash `scheduleId`, not the
  credentials.
- **Provisioning the discovery Schedule is a manual, one-time-per-environment step**,
  not part of the deploy pipeline: `pnpm qstash:setup-discovery-schedule` (must run
  under `doppler run --config <dev|stg|prd>` — `DOPPLER_CONFIG` scopes the `scheduleId`
  per environment; a fixed `scheduleId` would let one environment's setup silently
  overwrite another's, since `schedules.create` upserts by `scheduleId` and all three
  environments share one QStash account).

## GitHub Automation

- **PR Template**: `.github/pull_request_template.md` structures PR descriptions
- **Discord Notifications**: `.github/workflows/discord-pr-notification.yml` sends notifications for merged PRs with the `user-facing` label
- **PR Merged Webhook**: `.github/workflows/pr-merged-webhook.yml` posts every merged PR's metadata (`action_type: "pr_merged"`) to an external webhook — no label gate, no app-side awareness of what consumes it. Currently powers Plane ticket auto-close; see the root `AGENTS.md` Git conventions section for the PR-body convention that drives it.

## Common Patterns

### Adding a New tRPC Procedure

1. Define procedure in appropriate router in `src/server/api/routers/`
2. Use Zod for input validation
3. Add to router with proper authentication middleware (`protectedProcedure`, or `scopedProcedure("<scope>")` for a permission-gated surface)
4. Use in components via `api.router.procedure.useQuery()` or `useMutation()`

### Adding a New tRPC Router

1. Create router file in `src/server/api/routers/`
2. Import and register it in `src/server/api/root.ts`
3. Follow existing router patterns for consistency

### Creating a New Page

1. Add page in `src/app/` following App Router conventions
2. Use Server Components for initial data loading
3. Add to navigation in `src/components/nav/app-header.tsx`
4. Update global search in `src/server/api/routers/search.ts` if needed

### Adding Database Columns

1. Update schema in `src/server/db/models/`
2. Run `pnpm db:generate` to create migration
3. Run `pnpm db:push` (dev) or `pnpm db:migrate` (prod)
4. Update related TypeScript types and procedures

### External API Calls

- Use OAuth helpers in `src/server/api/oauth-helpers.ts`
- Cache access tokens appropriately
- Handle errors with proper user feedback
- Add retry logic for transient failures

### SoftRes Rules System

The SoftRes Scan feature validates character soft reserves against guild policies and attendance requirements.

**Architecture:**

- Rules defined in `src/server/services/softres-rules.ts`
- Rule types in `src/server/services/softres-rule-types.ts`
- UI rendering in `src/components/softres/softres-scan-table.tsx`

**Adding a New Rule:**

1. Define item ID constants (e.g., `ENDGAME_BWL_ITEMS`) at the top of `softres-rules.ts`
2. Create helper functions if needed (e.g., `hasEndgameBWLItem()`)
3. Define the rule object with:
   - `id`: Unique kebab-case identifier
   - `name`: Display name shown in badge
   - `description`: String or function returning description (support backtick-wrapped item names for highlighting)
   - `level`: `"info"`, `"highlight"`, `"warning"`, or `"error"`
   - `evaluate`: Function that returns true when rule applies
   - `icon`: Lucide icon name (e.g., "AlertTriangle", "XCircle", "Info")
4. Add rule to `SOFTRES_RULES` array

**Rule Levels & Tooltip Colors:**

- `info`: Gray badge, muted text in tooltip
- `highlight`: Blue badge, muted text in tooltip
- `warning`: Yellow badge, yellow-highlighted item names in tooltip
- `error`: Red badge, red-highlighted item names in tooltip

**Item Name Highlighting:**

- Wrap item names in backticks in rule descriptions
- Tooltip rendering automatically highlights them based on rule level

**Example Rules:**

- Restricted Naxx items requiring 50%+ attendance (error level)
- New/unmatched raiders (highlight level)
- Newer character reserving end-game items (warning level)

## Testing

Vitest is set up and runs in CI: `pnpm --filter temple-era-web test` (or
`pnpm test` from the root, which fans out to `apps/web`, `apps/bot` and
`packages/wcl`). Coverage is thin rather than absent — add to it rather than
treating the app as untested.

When adding tests:

- Vitest for unit tests, colocated in `__tests__/` beside the code under test
- Playwright for E2E, if and when an E2E layer is introduced — there is none today
- Focus on critical paths: authentication and scope resolution, raid creation,
  attendance calculation
