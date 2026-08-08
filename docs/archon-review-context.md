# Archon review context

Repo context loaded into Archon's review prompt via `repo_context_files` in
`.github/workflows/archon.yml`. **Audience: an automated PR reviewer, not a
coding agent.** The `AGENTS.md` files are the canonical instructions for agents
doing work; this file is a much smaller set of invariants for judging a diff.

Two rules governed what went in here:

1. **Nothing already enforced deterministically.** Formatting, lint, types,
   secrets, module resolution, stale `pnpm --filter` names and Discord wire
   *shapes* all hard-fail in CI or pre-commit. A reviewer restating them adds
   false-positive risk and no coverage.
2. **Nothing requiring a file outside the diff.** Archon is a single-shot
   reviewer with no tool loop. It cannot open a file, run a compiler or grep a
   build output. Every invariant below is checkable from the diff alone.

If you add to this file, apply both tests. Facts here are duplicated from the
three `AGENTS.md` files — when they disagree, `AGENTS.md` wins and this file
is the stale one.

---

## Authorization model

The highest-value thing to review in this repo. tRPC procedures live in
`apps/web/src/server/api/routers/` and come in four kinds:

| Procedure | Guarantee |
|---|---|
| `publicProcedure` | No authentication. Anyone on the internet. |
| `protectedProcedure` | Authenticated session, no specific permission. |
| `scopedProcedure(...scopes)` | Session holds **every** listed scope. |
| `adminProcedure` | Legacy. Retained only for `recipe.ts` catalog management. |

Scopes are defined in `apps/web/src/lib/scopes.ts` and mirrored by the `scope`
Postgres enum: `raidlog:manage`, `raidplan:manage`, `character:manage`,
`userpermissions:manage`, `templar:access`, `softres:access`,
`api-token:access`.

`resolveUserAccess()` in `apps/web/src/server/services/access-service.ts` is
the single chokepoint resolving a user's effective scopes.

**What a finding looks like:** a new or modified procedure that reads or writes
user, raid, character or attendance data on `publicProcedure`; a mutation on
`protectedProcedure` where an equivalent neighbouring mutation uses
`scopedProcedure`; a scope string that is not in the list above; a new use of
`adminProcedure` outside `recipe.ts`; authorization logic that bypasses
`resolveUserAccess()` and derives permissions itself.

**Not a finding:** `publicProcedure` on genuinely public read surfaces — much
of the site is public by design, and 41 existing uses are legitimate. Absence
of a scope is only suspicious when the data is user-specific or the operation
writes.

## The Discord contract triangle

`apps/web` owns five `/api/discord/*` endpoints. **`apps/bot` calls only four
of them:**

- `POST /api/discord/check-permissions`
- `POST /api/discord/create-raid`
- `POST /api/discord/update-raid`
- `POST /api/discord/update-bench`

The fifth, `POST /api/discord/proxy/{discordId}`, has **no bot call site** — it
serves Templar (see below). Do not flag a proxy change for "missing bot
update"; there is nothing in `apps/bot` to update. Flag it under the Templar
freeze instead.

All five require `Authorization: Bearer {TEMPLE_WEB_API_TOKEN}`. Request and
response shapes for the bot's four live in `@temple-era/contracts`
(`packages/contracts`), not in the route files.

**What a finding looks like:** a diff touching one of the four bot-facing
handlers in `apps/web/src/app/api/discord/`, or a bot call site, or a schema in
`packages/contracts`, **without** the corresponding change on the other sides.
Both sides must land in the same PR.

**Not a finding:** a type mismatch between the three. Handlers parse with the
request schema and annotate their 200 payload with the matching `*Result` type,
so a genuine shape mismatch is a typecheck failure that CI already catches.
Review the *intent* — an endpoint gaining a field the bot will never read, or a
bot reading a field the handler stopped sending — not the types.

## The Templar freeze

A third bot, **not in this repo and not visible to CI**, consumes `/api/v1/*`
and `/api/discord/proxy/[discordId]` using the same `TEMPLE_WEB_API_TOKEN`.

Treat any change to a v1 REST wire format, the proxy route, or
`apps/web/src/lib/openapi-registry.ts` as a **breaking change to an external
consumer that cannot be tested**. This is a release gate, not a style
preference.

**What a finding looks like:** a removed or renamed field in a v1 response; a
narrowed input; a new required request field; a changed status code; a route
removed from the OpenAPI registry. Additive optional fields are fine.

Note `POST /api/v1/admin/connections` is deliberately absent from the OpenAPI
spec so the Templar contract stays unchanged — that omission is intentional,
not a gap.

## Database and migrations

Drizzle ORM, schemas in `apps/web/src/server/db/models/`, migrations in
`apps/web/drizzle/`. Migrations are **not** part of `build`; they run via
`pnpm db:deploy`. Complex reporting goes through Postgres views (e.g.
`primary_raid_attendance_l6_lockout_wk`). Attendance is a 6-week rolling
window weighted by raid date.

**What a finding looks like:**

- A schema change in `models/` with **no** generated migration committed in the
  same PR.
- Destructive DDL with no guard or backfill: `DROP COLUMN`/`DROP TABLE`,
  `ALTER ... TYPE` on a populated column, adding `NOT NULL` without a default
  or a preceding backfill.
- A data backfill that is not idempotent — re-running it changes results.
  Migrations get replayed; assume it runs twice.
- A view changed without its dependent view or query updated.
- A multi-step write that should be in a transaction and is not.

**Not a finding:** the size of a generated Drizzle snapshot. These are
machine-written and routinely thousands of lines; they are not review surface.

## Shared package contract

`packages/*` are consumed as **compiled output** (`dist/`), never raw
TypeScript, because `apps/web` uses `Bundler` resolution while `apps/bot` uses
`Node16`.

**What a finding looks like:** an `exports` map missing `types` or `default`; a
new package without a `prepare` script; a new shared package not added to
`apps/bot/Dockerfile`.

**Not a finding:** a relative import inside `packages/*` missing its `.js`
suffix. The bot CI job imports the built entrypoint and fails on
`MODULE_NOT_FOUND`, so this is already caught deterministically.

## Bot runtime invariants

These are silent-failure shapes — wrong code that compiles, passes lint and
runs without error while doing nothing.

- **Pino argument order is context-first.** `logger.info({ ctx }, "msg")` is
  correct; `logger.info("msg", { ctx })` **silently discards the context**. This
  is the opposite of the Winston order used before Phase 7, so it is an easy
  regression when porting old code.
- **Message handlers must check the deduplicator**
  (`apps/bot/src/utils/messageDeduplication.ts`) before processing. Note it is a
  TTL `Map`, *not* an LRU — no size cap, no eviction by access order. Memory is
  bounded by arrival rate × TTL.
- **Discord.js caches are deliberately near-zero** (`Options.cacheWithLimits()`;
  message and thread caches disabled, users capped at 20). Fetches pass
  `cache: false`. A change that reintroduces caching is a memory regression on
  a small container.
- **Failures must not crash the bot.** External and Discord API calls are
  wrapped; failures are logged, not thrown. Uncaught exceptions log at `fatal`
  and exit deliberately, so Northflank restarts rather than leaving a half-dead
  gateway connection.
- Thread auto-archive duration must be one of Discord's enum values: 60, 1440,
  4320, 10080.

## Known false-positive traps

Archon's only two confirmed failures to date are both confident claims about
the *shape or existence* of something, disprovable in under a minute. Before
raising a finding of that kind, check whether you can actually see the evidence
in this diff.

- **Do not claim an API or CSS variable does not exist.** A claimed Tailwind v4
  removal (`--color-gray-200`) was factually wrong and would have been
  disproven by looking at the compiled output — which you cannot do.
- **Do not claim a config file is structurally invalid.** A YAML indentation
  bug was reported on valid, already-working config.
- **Do not comment on process:** branch names, commit message format, PR size,
  number of commits. Lefthook hooks enforce these and hard-fail.
- **Do not report on generated files:** `pnpm-lock.yaml`, `apps/web/drizzle/meta/*`
  snapshots, `docs/baselines/**`.
- **Both apps have a Vitest suite and CI runs it.** Coverage is thin, so "this
  needs a test" can be a fair finding on risky logic — but never phrase it as
  "there is no test suite", which is false.
