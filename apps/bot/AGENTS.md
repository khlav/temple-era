# AGENTS.md — `apps/bot`

Guidance for coding agents working in the **Discord bot**.

> **Read the root `AGENTS.md` first.** It covers workspace layout, the shared toolchain,
> environment-variable rules, git/commit conventions, and the Templar constraint. This
> file covers only what is specific to `apps/bot`.

**Running commands**: examples below use bare `pnpm <script>`. From the repo root, prefix with a filter:

```bash
pnpm --filter temple-era-bot <script>    # or cd apps/bot first
```

## Project Overview

Temple Raids Discord Bot is a Discord bot that integrates with the Temple Ashkandi website to automatically create raid entries when raid managers post Warcraft Logs (WCL) links. It also supports bench management through thread interactions.

## Common Commands

### Development
```bash
# Install dependencies (run at the repo root — installs the whole workspace)
pnpm install

# Start development server with hot reload
pnpm dev

# Type checking only
pnpm typecheck
```

### Building and Running
```bash
# Build for production
pnpm build

# Start production build
pnpm start
```

### Code Quality

This app uses **oxlint + oxfmt**, configured by the root `.oxlintrc.json`. It was migrated off ESLint + Prettier during the monorepo migration — do not reintroduce them.

```bash
# Lint TypeScript files
pnpm lint

# Lint and auto-fix issues
pnpm lint:fix

# Check formatting
pnpm format

# Apply formatting
pnpm format:fix
```

## Architecture

### Core Flow

The bot operates through three main message handlers:

1. **Main Channel Handler** (`messageHandler.ts`):
   - Monitors the configured raid logs channel for WCL links
   - Validates user permissions via API call to Temple Ashkandi website
   - Extracts WCL report ID from URLs
   - Calls API to create raid entry
   - Creates Discord thread with raid name
   - Posts raid URL in the thread

2. **Thread Message Handler** (`threadMessageHandler.ts`):
   - Monitors messages in threads created by the bot
   - Detects "bench" keyword followed by character names
   - Extracts raid ID from thread messages (parses `/raids/123` URLs)
   - Calls API to update bench with character names
   - Provides feedback about matched/unmatched characters

3. **Message Update Handler** (`messageUpdateHandler.ts`):
   - Handles edited messages in the main channel
   - Re-processes WCL links if message is edited

### Key Components

- **Bot Initialization** (`bot.ts`): Sets up Discord client with aggressive cache limits to reduce memory usage. Configures event handlers and optional thread cleanup cron job.

- **Permission Checking** (`permissionChecker.ts`): Validates that users have a linked Discord account and hold the `raidlog:manage` scope, via the Temple Ashkandi API. Exposes `canManageRaidLogs`, which reads the response's `scopes`. The older `isRaidManager` flag is broader than the gate the write routes actually enforce, so it is only a deploy-skew fallback — see `docs/followups/legacy-access-booleans-cleanup.md`.

- **WCL Detection** (**`@temple-era/wcl`**, not a local module): Extracts Warcraft Logs URLs and report IDs. This used to be `services/wclDetector.ts`; it moved to `packages/wcl` because `apps/web` had its own copy that had drifted — see that package's README for the divergences. Import it as a package (`from "@temple-era/wcl"`), and add tests there rather than here.

- **Bench Parser** (`benchParser.ts`): Parses character names from bench messages and extracts raid IDs from thread messages.

- **Thread Cleanup** (`threadCleanup.ts`): Optional cron job to delete bot-created threads older than configured days (disabled by default).

- **Message Deduplication** (`messageDeduplication.ts`): LRU cache to prevent duplicate processing of messages.

### API Integration

The web app that owns these endpoints lives in this monorepo at `apps/web` (handlers in `apps/web/src/app/api/discord/`). Changes to either side of this contract should land in the same PR.

The bot communicates with four Temple Ashkandi API endpoints:

1. `POST /api/discord/check-permissions` - Verifies the user holds `raidlog:manage`
2. `POST /api/discord/create-raid` - Creates raid entry from WCL link
3. `POST /api/discord/update-raid` - Replaces the WCL report behind an edited message
4. `POST /api/discord/update-bench` - Updates raid bench with character names

All API calls require Bearer token authentication via `TEMPLE_WEB_API_TOKEN`.

Request bodies are typed and responses are parsed with **`@temple-era/contracts`**
(`packages/contracts`) rather than being read off an untyped `await response.json()`. That
package is compiled — the bot resolves it from `dist/`, so `pnpm --filter "./apps/bot..." build`
(note the `...`) is what builds it first. A handler that receives a body the schema does not
describe logs and bails rather than acting on `undefined`.

### Memory Optimization

The bot uses aggressive cache limits via `Options.cacheWithLimits()` to minimize memory usage:
- Message cache: disabled (size 0)
- Thread cache: disabled (size 0)
- User cache: limited to 20 users
- Other managers: disabled

Fetches use `cache: false` option to prevent adding items to Discord.js cache.

## Environment Configuration

Required variables:
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_RAID_LOGS_CHANNEL_ID` - Channel ID to monitor
- `API_BASE_URL` - Temple Ashkandi website base URL
- `TEMPLE_WEB_API_TOKEN` - API authentication token

Optional variables:
- `LOG_LEVEL` - Logging level (default: `info`)
- `DISCORD_LOG_THREAD_CLEANUP_ENABLED` - Enable thread cleanup (default: `false`)
- `DISCORD_LOG_THREAD_CLEANUP_DAYS` - Days before thread deletion (default: `3`)
- `DISCORD_LOG_THREAD_CLEANUP_CRON` - Cron schedule for cleanup (default: `0 1 * * *`)

Secrets live in Doppler (`temple-era-bot`). One-time setup:

```bash
doppler login && cd apps/bot && doppler setup --no-interactive
```

Local development uses Doppler, same as `apps/web` — there is no `.env` here.
`pnpm dev` runs under `doppler run`; `pnpm dev:env` is an escape hatch that reads
whatever is already in the environment.

Northflank's lack of a Doppler integration is a **production** constraint only,
and does not affect local development. In production, `DISCORD_BOT_TOKEN` and
`TEMPLE_WEB_API_TOKEN` come from a Northflank **secret group**, not the service's
runtime environment;
`.github/workflows/sync-bot-secrets.yml` pushes them from Doppler on deploy.

That workflow compares before writing and skips when nothing changed, because a
write redeploys the service and drops the gateway connection — and unlike Vercel
there is no previous-deployment fallback.

## Code Organization

```
src/
├── index.ts                      # Entry point
├── bot.ts                        # Discord client setup and event handlers
├── config/
│   ├── env.ts                    # Environment variable configuration
│   └── logger.ts                 # pino logger setup
├── handlers/
│   ├── messageHandler.ts         # Main channel WCL link detection
│   ├── messageUpdateHandler.ts   # Edited message handler
│   └── threadMessageHandler.ts   # Thread bench message handler
├── services/
│   ├── permissionChecker.ts      # User permission validation
│   ├── benchParser.ts            # Character name parsing
│   └── threadCleanup.ts          # Thread cleanup cron job
├── responses/
│   └── ephemeralBuilder.ts       # Discord ephemeral response builder
└── utils/
    └── messageDeduplication.ts   # LRU-based message deduplication
```

## Important Patterns

### ES Modules
This project uses ES modules (`"type": "module"` in package.json). All imports must use `.js` extensions even for TypeScript files:
```typescript
import { config } from "./config/env.js";  // Correct
import { config } from "./config/env";     // Wrong
```

### Error Handling
- All Discord API calls and external API calls are wrapped in try-catch
- Errors are logged with structured context using the pino logger
- User-facing error messages never expose internal details
- API failures are logged but don't crash the bot

### Logging
Use the pino logger from `config/logger.ts`, matching `apps/web`. **The context object comes
first** — this is the opposite of the Winston order used before Phase 7, and passing it second
silently discards it rather than failing:

```typescript
logger.info({ context: "data" }, "message");     // correct
logger.info("message", { context: "data" });     // context is DROPPED
```

```typescript
logger.warn({ userId: "123" }, "warning");
logger.error({ err: error }, "error occurred");  // `err` gets pino's Error serializer
logger.debug("debug info");                      // message-only calls are unchanged
```

Output is line-delimited JSON with ISO timestamps, written synchronously. Operators read it
raw in the Northflank log view — `docs/phase-5-bot-cutover.md` uses the startup lines as the
healthy-deploy signal — so there is no pretty-printer in the runtime path. For a readable
local stream, pipe it: `pnpm dev | npx pino-pretty`.

Uncaught exceptions and unhandled rejections are logged at `fatal` and then exit the process,
which is what Winston's `handleExceptions` / `handleRejections` did. Northflank restarts the
container; a bot left alive after an uncaught exception holds a gateway connection it may no
longer be servicing.

### Message Deduplication
Always check the deduplicator before processing messages:
```typescript
const deduplicator = new MessageDeduplicator();

if (deduplicator.has(message.id)) {
  logger.debug(`Message ${message.id} already processed, skipping`);
  return;
}
deduplicator.add(message.id);
```

## Discord.js v14 Patterns

- Use `GatewayIntentBits` for intent configuration
- Use `Events` enum for event names
- Check `message.channel.isThread()` to distinguish threads from channels
- Use `message.channel.parentId` to get parent channel of threads
- Thread auto-archive duration must be valid Discord enum: 60, 1440, 4320, 10080

## Git Workflow

Branch naming, commit format, the `/ship` process, and the `user-facing` label are workspace-wide — see the root `AGENTS.md` and `.cursorrules`.

Two things specific to this app:

- **Scope commits with a `bot/` prefix** so a reader can tell which app changed: `fix(bot/handler): resolve message parsing issue`.
- **`apps/bot/**`-only changes are rarely `user-facing`** — the bot has no UI. Apply that label only when guild members will notice a behaviour change in Discord.

## Testing Approach

While there is no formal test suite, changes should be tested locally:

1. Set up `.env` with test Discord server credentials
2. Run `pnpm dev` to start development server
3. Test message handling, thread creation, and bench updates
4. Verify logging output for errors
5. Check memory usage doesn't grow unbounded
