# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Temple Raids is a comprehensive raid management and attendance tracking system for Temple, a Horde guild on the Ashkandi server in World of Warcraft Classic. Built with the T3 Stack (Next.js 15, tRPC, Drizzle ORM, PostgreSQL), it provides a modern web interface for managing guild raids, tracking attendance over rolling 6-week periods, and coordinating crafting resources.

Live at: https://www.templeashkandi.com

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

- ESLint with auto-fix on all staged TypeScript files
- Prettier formatting on staged files
- Warning if console.log is detected
- Reminder for database migrations

## Architecture Overview

### Tech Stack

- **Next.js 15**: React framework with App Router (RSC)
- **tRPC**: End-to-end typesafe APIs between client and server
- **Drizzle ORM**: Type-safe database operations with PostgreSQL
- **NextAuth.js**: Authentication with Discord OAuth
- **Tailwind CSS + shadcn/ui**: Styling with Radix UI components
- **TanStack Query**: React Query for data fetching and caching
- **Zod**: Runtime validation and type safety

### Project Structure

```
src/
├── app/                          # Next.js 15 App Router pages
│   ├── (dashboard)/             # Dashboard route group
│   ├── api/                     # API routes (REST endpoints)
│   │   ├── auth/               # NextAuth.js route handler
│   │   ├── discord/            # Discord bot integration endpoints
│   │   └── trpc/               # tRPC endpoint
│   ├── admin/                   # Admin pages (user management)
│   ├── characters/              # Character pages
│   ├── raid-manager/            # Raid manager pages
│   ├── raids/                   # Raid detail/edit pages
│   ├── rare-recipes/            # Recipe search pages
│   └── profile/                 # User profile pages
├── components/                   # React components organized by feature
│   ├── admin/                   # Admin components
│   ├── characters/              # Character components
│   ├── dashboard/               # Dashboard components
│   ├── nav/                     # Navigation (sidebar, header)
│   ├── raid-manager/            # Raid manager components
│   ├── raids/                   # Raid components
│   ├── rare-recipes/            # Recipe search components
│   └── ui/                      # Reusable UI components (shadcn/ui)
├── server/
│   ├── api/
│   │   ├── routers/            # tRPC routers (main API layer)
│   │   │   ├── character.ts    # Character operations
│   │   │   ├── dashboard.ts    # Dashboard data
│   │   │   ├── discord.ts      # Discord integration
│   │   │   ├── raid.ts         # Raid operations
│   │   │   ├── raidlog.ts      # Raid log operations
│   │   │   ├── recipe.ts       # Recipe operations
│   │   │   ├── search.ts       # Global search
│   │   │   └── user.ts         # User operations
│   │   ├── interfaces/         # TypeScript interfaces for external APIs
│   │   ├── root.ts             # Main tRPC router
│   │   ├── trpc.ts             # tRPC setup and context
│   │   ├── wcl-helpers.ts      # Warcraft Logs API helpers
│   │   ├── wcl-queries.ts      # Warcraft Logs GraphQL queries
│   │   └── oauth-helpers.ts    # OAuth utility functions
│   ├── auth/
│   │   ├── config.ts           # NextAuth.js configuration
│   │   └── index.ts            # Auth helpers
│   └── db/
│       ├── models/              # Drizzle schema definitions
│       │   ├── auth-schema.ts  # NextAuth.js tables
│       │   ├── raid-schema.ts  # Core raid/character tables
│       │   ├── recipe-schema.ts # Recipe tables
│       │   └── views-schema.ts # Database views for reporting
│       ├── api/                 # Database query helpers
│       ├── schema.ts            # Main schema export
│       ├── index.ts             # Database client
│       └── helpers.ts           # Shared database utilities
├── contexts/                     # React contexts
├── hooks/                        # Custom React hooks
├── lib/                          # Utility libraries
├── trpc/                         # tRPC client setup
│   ├── react.tsx                # tRPC React Query provider
│   ├── server.ts                # tRPC server-side caller
│   └── query-client.ts          # TanStack Query client config
├── utils/                        # Utility functions
├── constants.ts                  # Application constants
└── env.js                        # Environment variable validation (T3 Env)
```

### Key Architectural Patterns

#### Data Flow

1. **Client-side**: React components use tRPC hooks (`api.router.procedure.useQuery()`)
2. **tRPC Layer**: Type-safe procedures in `src/server/api/routers/`
3. **Database Layer**: Drizzle ORM queries with database views for complex queries
4. **External APIs**: Warcraft Logs (GraphQL) and Battle.net (REST) via OAuth

#### Authentication & Authorization

- Discord OAuth via NextAuth.js
- Session-based authentication
- Role-based access control: Admin, Raid Manager, User
- Discord user ID is the primary identifier

#### Database Schema

- **Core Tables**: `raids`, `raid_logs`, `characters`, `raid_log_attendee_map`, `raid_bench_map`
- **Character Mapping**: Characters can be linked to a "primary" character for consolidated attendance
- **Database Views**: Complex queries are materialized as views (e.g., `primary_raid_attendance_l6_lockout_wk`)
- **Attendance Calculation**: 6-week rolling window based on raid dates and attendance weights

#### External API Integration

- **Warcraft Logs (WCL)**: Fetches raid logs via GraphQL API
  - OAuth client credentials flow
  - Queries in `src/server/api/wcl-queries.ts`
  - Helpers in `src/server/api/wcl-helpers.ts`
- **Battle.net**: Fetches character data (unused currently but configured)
- **Discord Bot**: Separate repository, communicates via REST API endpoints in `src/app/api/discord/`

#### Component Patterns

- Server Components by default (Next.js 15 App Router)
- Client Components marked with `"use client"` directive
- Streaming with React Suspense for data fetching
- Skeleton loaders for loading states
- Toast notifications for user feedback

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
- Be concise and focus on key changes
- Include technical context only when relevant

### Environment Setup

Required environment variables:

- `DATABASE_URL` - PostgreSQL connection string
- `AUTH_SECRET` - Generate with `npx auth secret`
- `AUTH_DISCORD_ID` & `AUTH_DISCORD_SECRET` - Discord OAuth
- `WCL_CLIENT_ID` & `WCL_CLIENT_SECRET` - Warcraft Logs API
- `BATTLENET_CLIENT_ID` & `BATTLENET_CLIENT_SECRET` - Battle.net API
- `TEMPLE_WEB_API_TOKEN` - For Discord bot integration
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_RAID_LOGS_CHANNEL_ID` - Discord channel for raid logs

Optional:

- `NEXT_PUBLIC_POSTHOG_ENABLED` - Enable PostHog analytics ("true")
- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog API key

See `.env.example` for full list.

### Code Quality Standards

#### TypeScript

- Strict mode enabled
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

#### Styling

- Use Tailwind CSS utility classes
- Follow shadcn/ui component patterns
- Use class-variance-authority (cva) for component variants
- Responsive design with mobile-first approach

#### API Design

- Use tRPC for internal APIs (client ↔ server)
- Use Next.js API routes for external integrations (Discord bot)
- Validate all inputs with Zod
- Use proper error handling and meaningful error messages

## Discord Bot Integration

The website provides REST API endpoints for the Discord bot (separate repo):

- `POST /api/discord/create-raid` - Creates raid from WCL URL
- `POST /api/discord/check-permissions` - Checks user permissions
- Both require `Authorization: Bearer {TEMPLE_WEB_API_TOKEN}` header

## Common Patterns

### Adding a New tRPC Procedure

1. Define procedure in appropriate router in `src/server/api/routers/`
2. Use Zod for input validation
3. Add to router with proper authentication middleware
4. Use in components via `api.router.procedure.useQuery()` or `useMutation()`

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

## Testing

The project currently does not have a formal test suite. When adding tests:

- Consider using Vitest for unit tests
- Use Playwright for E2E tests
- Focus on critical paths: authentication, raid creation, attendance calculation
