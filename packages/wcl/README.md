# `@temple-era/wcl`

Warcraft Logs URL and report-ID parsing, shared by `apps/web` and `apps/bot`.

Like `@temple-era/contracts`, this package is consumed as **compiled output** (`dist/`), never
as raw TypeScript — see the root `AGENTS.md` for why, and for the `prepare` / Dockerfile /
dependency-declaration obligations that come with adding a shared package.

## Why it exists

Three copies of the same regex had drifted apart. Consolidating them meant picking a single
behaviour for each divergence rather than silently inheriting whichever copy was replaced
first, so each one is recorded here and pinned by a test in `src/__tests__/parse.test.ts`.

### 1. Which hosts count

| | before | |
|---|---|---|
| `apps/bot/src/services/wclDetector.ts` | `(?:(?:vanilla\|classic\|www)\.)?warcraftlogs\.com` | accepted `www.` and the bare domain |
| `apps/web/src/server/api/discord-helpers.ts` | `(?:vanilla\|classic)\.warcraftlogs\.com` | rejected both |

The bot's form was a deliberate patch; the web's was never updated. **Resolved in favour of
the bot**: the website was silently ignoring real reports posted as `www.` or bare, and
dropping a valid log is worse than accepting a URL shape the site also serves.

### 2. How far a match extends

The web copy ended in `(?:[?#].*)?`. The `.*` is greedy to end-of-line, so the match span
covered every word typed after the link.

This was invisible wherever the URL is rebuilt from the capture group, but
`apps/web/src/components/raids/discord-warcraft-logs.tsx` uses the raw match as the anchor
text — so `<report-url>?fight=3 and then we wiped` rendered the trailing prose as part of the
link. **Resolved with a bounded `[?#][^\s]*`.**

### 3. Over-long report codes

Both copies matched `[a-zA-Z0-9]{16}` with nothing following it, so a 17-character code
matched its first 16 characters and yielded a report ID that does not exist. `apps/bot` passes
that ID straight to `POST /api/discord/create-raid`.

**Resolved with a `(?![a-zA-Z0-9])` boundary**: a malformed link now yields nothing rather
than a confident wrong answer.

## Deliberately unchanged

`extractWarcraftLogsUrls` preserves duplicates and input order. `apps/bot` reads only the
first URL, and `apps/web` emits one record per URL found — deduplicating here would change
how the site counts logs per message, which is out of scope for a consolidation.

## API

| Export | Purpose |
|---|---|
| `extractWarcraftLogsUrls(content)` | Every report URL in a block of text, normalised to the canonical host |
| `extractReportId(url)` | The first report ID in a URL, or `null` |
| `buildReportUrl(reportId)` | The canonical URL for a report ID |
| `createWclUrlRegex()` | A **fresh** global regex, for callers that need the match span or offset |
| `WCL_CANONICAL_HOST` | The host URLs are normalised to |

`createWclUrlRegex()` returns a new object every call on purpose. A shared `/g` regex carries
`lastIndex` between calls, so a second caller starts mid-string and misses matches.
