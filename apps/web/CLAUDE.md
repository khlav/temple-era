# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Maintenance Rule**: When making changes that affect architecture, project structure, commands, database schema, API endpoints, or common patterns, update this file to keep it synchronized with the codebase.

## Project Overview

Temple Raids is a comprehensive raid management and attendance tracking system for Temple, a Horde guild on the Ashkandi server in World of Warcraft Classic. Built with the T3 Stack (Next.js 15, tRPC, Drizzle ORM, PostgreSQL), it provides a modern web interface for managing guild raids, tracking attendance over rolling 6-week periods, coordinating crafting resources, and planning raid compositions.

Live at: https://www.temple-era.com

## Development Commands

### Essential Commands

```bash
pnpm dev              # Start development server with Turbo
pnpm dev:standard     # Start development server without Turbo
pnpm build            # Build for production
pnpm start            # Start production server
pnpm preview          # Build and start production server locally
```

### Database Commands

```bash
pnpm db:push          # Push schema changes to database (development)
pnpm db:generate      # Generate migration files
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Drizzle Studio (database GUI)
```

### Code Quality Commands

```bash
pnpm lint             # Run ESLint
pnpm lint:fix         # Run ESLint with auto-fix
pnpm typecheck        # Run TypeScript type checking
pnpm check            # Run both ESLint and typecheck
pnpm format:check     # Check Prettier formatting
pnpm format:write     # Fix Prettier formatting
```

### Pre-commit Hooks

The project uses Husky with lint-staged to automatically run checks before commits:

- ESLint with auto-fix on all staged TypeScript files (`--max-warnings=0`)
- Prettier formatting on staged files
- Warning if `console.log` is detected
- Reminder for database migrations

#### Commit Message Format

Enforced by the `commit-msg` hook. Expected format: `type(scope): description`

- Valid types: `feat`, `fix`, `chore`, `refactor`, `hotfix`, `dev`
- Examples: `feat(search): add advanced filtering`, `fix(ui): resolve layout issue`
- Warns on WIP/temporary language
- The `prepare-commit-msg` hook auto-suggests messages based on branch name

#### Pre-push Checks

The `pre-push` hook runs before every push:

1. Validates branch name format (`{type}/{description}`)
2. Runs full ESLint
3. Runs full TypeScript type check
4. Runs production build
5. Checks for remaining `console.log` statements (warning)

## Architecture Overview

### Tech Stack

- **Next.js 15**: React framework with App Router (RSC)
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

```
src/
├── app/                          # Next.js 15 App Router pages
│   ├── (dashboard)/             # Dashboard route group (home page)
│   ├── api/                     # API routes (REST endpoints)
│   │   ├── auth/               # NextAuth.js route handler
│   │   ├── debug/              # Debug endpoints (metadata inspection)
│   │   │   └── metadata/      # Character and raid metadata
│   │   ├── discord/            # Discord bot integration endpoints
│   │   └── trpc/               # tRPC endpoint
│   ├── admin/                   # Admin pages (user management, test)
│   ├── characters/              # Character pages ([characterId] dynamic route)
│   ├── login/                   # Login page (NextAuth catch-all route)
│   ├── profile/                 # User profile pages
│   ├── raid-manager/            # Raid manager pages
│   │   ├── characters/         # Character management
│   │   ├── log-refresh/        # Log refresh tools
│   │   └── raid-planner/       # Raid composition planner
│   │       ├── [planId]/       # Individual plan view
│   │       └── config/         # Planner configuration
│   ├── raids/                   # Raid detail/edit pages
│   │   ├── [raidId]/edit/      # Raid editing
│   │   └── new/                # New raid creation
│   ├── rare-recipes/            # Recipe search pages
│   ├── reports/                 # Reports pages
│   │   └── attendance/         # Side-by-side attendance report
│   └── softres/                 # SoftRes scan pages ([id] dynamic route)
├── components/                   # React components organized by feature
│   ├── admin/                   # Admin components
│   ├── characters/              # Character components
│   ├── common/                  # Shared utility components
│   ├── dashboard/               # Dashboard components
│   ├── debug/                   # Debug-related components
│   ├── misc/                    # Miscellaneous components
│   ├── nav/                     # Navigation (sidebar, header)
│   ├── profile/                 # Profile components
│   ├── raid-manager/            # Raid manager components
│   ├── raid-planner/            # Raid composition planner components
│   ├── raids/                   # Raid components
│   ├── rare-recipes/            # Recipe search components
│   ├── reports/                 # Report components
│   │   └── attendance/         # Attendance report components
│   ├── softres/                 # SoftRes scan components
│   └── ui/                      # Reusable UI components (shadcn/ui)
├── server/
│   ├── api/
│   │   ├── routers/            # tRPC routers (main API layer)
│   │   │   ├── character.ts    # Character operations
│   │   │   ├── dashboard.ts    # Dashboard data
│   │   │   ├── discord.ts      # Discord integration
│   │   │   ├── profile.ts      # User profile operations
│   │   │   ├── raid.ts         # Raid operations
│   │   │   ├── raid-helper.ts  # Raid Helper bot integration
│   │   │   ├── raid-plan.ts    # Raid composition plans
│   │   │   ├── raid-plan-template.ts # Raid plan templates
│   │   │   ├── raidlog.ts      # Raid log operations
│   │   │   ├── recipe.ts       # Recipe operations
│   │   │   ├── reports.ts      # Attendance report operations
│   │   │   ├── search.ts       # Global search
│   │   │   ├── softres.ts      # SoftRes scan operations
│   │   │   └── user.ts         # User operations
│   │   ├── interfaces/         # TypeScript interfaces for external APIs
│   │   │   ├── dashboard.ts
│   │   │   ├── raid.ts
│   │   │   ├── recipe.ts
│   │   │   ├── softres.ts
│   │   │   └── wcl.ts
│   │   ├── root.ts             # Main tRPC router (registers all routers)
│   │   ├── trpc.ts             # tRPC setup, context, and middleware
│   │   ├── discord-helpers.ts  # Discord API helper functions
│   │   ├── wcl-helpers.ts      # Warcraft Logs API helpers
│   │   ├── wcl-queries.ts      # Warcraft Logs GraphQL queries
│   │   └── oauth-helpers.ts    # OAuth utility functions
│   ├── services/                # Business logic services
│   │   ├── softres-rules.ts    # SoftRes validation rules
│   │   ├── softres-rule-types.ts # SoftRes rule type definitions
│   │   └── softres-matcher-batch.ts # Character matching logic
│   ├── auth/
│   │   ├── config.ts           # NextAuth.js configuration
│   │   └── index.ts            # Auth helpers
│   ├── metadata-helpers.ts     # Metadata generation helpers
│   └── db/
│       ├── models/              # Drizzle schema definitions
│       │   ├── auth-schema.ts  # NextAuth.js tables
│       │   ├── raid-schema.ts  # Core raid/character tables
│       │   ├── raid-plan-schema.ts # Raid plan tables
│       │   ├── recipe-schema.ts # Recipe tables
│       │   └── views-schema.ts # Database views for reporting
│       ├── api/                 # Database query helpers
│       │   └── helpers.ts      # Shared query utilities
│       ├── schema.ts            # Main schema export
│       ├── index.ts             # Database client
│       └── helpers.ts           # Shared database utilities
├── contexts/                     # React contexts
│   └── global-quick-launcher-context.tsx
├── hooks/                        # Custom React hooks
│   ├── use-mobile.tsx           # Mobile viewport detection
│   ├── use-spell-icon.ts       # WoW spell icon URL helper
│   └── use-toast.ts            # Toast notification hook
├── lib/                          # Utility libraries
│   ├── item-mappings/           # WoW item data by raid zone (JSON)
│   ├── aa-formatting.ts        # Auto-assignment formatting
│   ├── aa-template.ts          # Auto-assignment templates
│   ├── badge-definitions.ts    # Badge definition constants
│   ├── badge-evaluator.ts      # Badge evaluation logic
│   ├── class-specs.ts          # WoW class/spec definitions
│   ├── compression.ts          # Data compression utilities
│   ├── get-base-url.ts         # Base URL resolution helper
│   ├── helpers.ts              # General helper functions
│   ├── mrt-codec.ts            # MRT (Method Raid Tools) encoding/decoding
│   ├── raid-formatting.ts      # Raid display formatting
│   ├── raid-weights.ts         # Raid attendance weight calculations
│   ├── raid-zones.ts           # Raid zone constants and mappings
│   ├── softres-zone-mapping.ts # SoftRes instance to DB zone mapping
│   └── utils.ts                # General utility functions (cn helper)
├── trpc/                         # tRPC client setup
│   ├── react.tsx                # tRPC React Query provider
│   ├── server.ts                # tRPC server-side caller
│   └── query-client.ts          # TanStack Query client config
├── utils/                        # Utility functions
│   └── posthog.ts               # PostHog analytics client
├── middleware.ts                  # Next.js middleware (auth, redirects)
├── constants.ts                  # Application constants (raid tracking labels)
└── env.js                        # Environment variable validation (T3 Env)
```

### Key Architectural Patterns

#### Data Flow

1. **Client-side**: React components use tRPC hooks (`api.router.procedure.useQuery()`)
2. **tRPC Layer**: Type-safe procedures in `src/server/api/routers/`
3. **Database Layer**: Drizzle ORM queries with database views for complex queries
4. **External APIs**: Warcraft Logs (GraphQL), Battle.net (REST), Discord, and Raid Helper via OAuth/API keys

#### Authentication & Authorization

- Discord OAuth via NextAuth.js (v5 beta)
- Session-based authentication
- Role-based access control with four tRPC procedure types:
  - `publicProcedure` - No authentication required
  - `protectedProcedure` - Requires authenticated user
  - `raidManagerProcedure` - Requires `isRaidManager` role
  - `adminProcedure` - Requires `isAdmin` role
- Discord user ID is the primary identifier

#### Database Schema

- **Core Tables**: `raids`, `raid_logs`, `characters`, `raid_log_attendee_map`, `raid_bench_map`
- **Raid Planning Tables**: Defined in `raid-plan-schema.ts` for composition planning
- **Character Mapping**: Characters can be linked to a "primary" character for consolidated attendance
- **Database Views**: Complex queries are materialized as views (e.g., `primary_raid_attendance_l6_lockout_wk`)
- **Attendance Calculation**: 6-week rolling window based on raid dates and attendance weights

#### External API Integration

- **Warcraft Logs (WCL)**: Fetches raid logs via GraphQL API
  - OAuth client credentials flow
  - Queries in `src/server/api/wcl-queries.ts`
  - Helpers in `src/server/api/wcl-helpers.ts`
- **Battle.net**: Fetches character data (configured via OAuth)
- **Discord Bot**: Separate repository, communicates via REST API endpoints in `src/app/api/discord/`
  - Helper functions in `src/server/api/discord-helpers.ts`
- **Raid Helper**: Integration for raid scheduling via `RAID_HELPER_API_KEY`

#### Component Patterns

- Server Components by default (Next.js 15 App Router)
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

### Branch and PR Rules

**CRITICAL**: All development work MUST be done on feature branches. Never commit directly to `main`.

#### Branch Naming Convention

- `feature/` - New user-facing functionality
- `fix/` - Bug fixes
- `chore/` - Maintenance, dependencies, tooling
- `refactor/` - Code improvements without behavior changes
- `hotfix/` - Critical production fixes
- `dev/` - Developer-only changes (docs, config, CI)

Use kebab-case: `feature/add-raid-filtering`

#### Commit Message Convention

Format: `type(scope): description`

- Valid types: `feat`, `fix`, `chore`, `refactor`, `hotfix`, `dev`
- Enforced by the `commit-msg` Husky hook
- The `prepare-commit-msg` hook auto-suggests messages from branch name

#### "Ship It" Process

When the user says "ship it", follow these steps exactly:

1. **Create feature branch** (if on main): `git checkout -b {type}/{description}`
2. **Stage and commit**:
   - `git add .`
   - `git commit -m "{type}({scope}): {description}"`
3. **Push branch**: `git push origin {branch-name}`
4. **Create PR**: Use `gh pr create` and follow `.github/pull_request_template.md`
5. **Apply user-facing label**:
   - Apply for `feature/` and `fix/` branches (unless only config files changed)
   - Skip for `chore/`, `dev/`, `refactor/` branches
   - Use: `gh pr create --label "user-facing"`
6. **Return clickable link**: `[PR #123: Title](https://github.com/khlav/temple-raids-t3/pull/123)`

The `user-facing` label controls Discord notifications for merged PRs.

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
- Node.js 22.x (required: `>=22.0.0 <23.0.0`)
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

Optional:

- `NEXT_PUBLIC_POSTHOG_ENABLED` - Enable PostHog analytics ("true")
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog API key
- `NEXT_PUBLIC_APP_URL` - Application URL
- `NEXT_PUBLIC_RESTRICTED_NAXX_ITEMS_URL` - URL to restricted items spreadsheet
- `GOOGLE_SITE_VERIFICATION` - Google site verification token
- `DISCORD_WEBHOOK_PUBLIC_KEY` - Discord webhook verification

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
- Migrations run automatically on `postbuild` via `drizzle-kit migrate`

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

The website provides REST API endpoints for the Discord bot (separate repo):

- `POST /api/discord/create-raid` - Creates raid from WCL URL
- `POST /api/discord/check-permissions` - Checks user permissions
- `POST /api/discord/update-raid` - Updates existing raid data
- `POST /api/discord/update-bench` - Updates raid bench assignments
- All require `Authorization: Bearer {TEMPLE_WEB_API_TOKEN}` header
- Helper functions in `src/server/api/discord-helpers.ts`

## GitHub Automation

- **PR Template**: `.github/pull_request_template.md` structures PR descriptions
- **Discord Notifications**: `.github/workflows/discord-pr-notification.yml` sends notifications for merged PRs with the `user-facing` label

## Common Patterns

### Adding a New tRPC Procedure

1. Define procedure in appropriate router in `src/server/api/routers/`
2. Use Zod for input validation
3. Add to router with proper authentication middleware (`protectedProcedure`, `raidManagerProcedure`, or `adminProcedure`)
4. Use in components via `api.router.procedure.useQuery()` or `useMutation()`

### Adding a New tRPC Router

1. Create router file in `src/server/api/routers/`
2. Import and register it in `src/server/api/root.ts`
3. Follow existing router patterns for consistency

### Creating a New Page

1. Add page in `src/app/` following App Router conventions
2. Use Server Components for initial data loading
3. Add to navigation in `src/components/nav/app-sidebar.tsx`
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

The project currently does not have a formal test suite. When adding tests:

- Consider using Vitest for unit tests
- Use Playwright for E2E tests
- Focus on critical paths: authentication, raid creation, attendance calculation
