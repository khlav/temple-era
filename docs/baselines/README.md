# Baselines

Captured artifacts from **production before the monorepo cutover**, used as the
comparison target for the Phase 4 and Phase 7 release gates.

## `openapi-v1-prod.json`

The `/api/v1/openapi.json` document served by `https://www.temple-era.com`.

| | |
|---|---|
| Captured | 2026-07-28, from production, before any Vercel change |
| Source | `GET https://www.temple-era.com/api/v1/openapi.json` (no auth) |
| Size | 60,555 bytes |
| SHA-256 | `0134df681302a33bc27c82dc3da67e0a4ddd3b12999d9806ce6ac3709a204870` |
| Contents | OpenAPI 3.0.0 — 30 paths, 26 schemas |

**Determinism verified.** The spec is generated at request time from the Zod
registry in `apps/web/src/lib/openapi-registry.ts`, so it was worth confirming
it is stable rather than assuming. Three separate requests returned identical
bytes, which is what makes a byte-for-byte comparison a legitimate gate rather
than a flaky one.

### Why this matters

An external Discord bot — **Templar** — consumes `/api/v1/*` and
`/api/discord/proxy/[discordId]` using the shared `TEMPLE_WEB_API_TOKEN`. It is
not in this monorepo and cannot be updated in lockstep. Any drift in this spec
is a breaking change to a consumer you cannot see.

The migration plan treats this as a **release gate, not a guideline** — see
`docs/monorepo-migration-plan.md` §1 and the Phase 4 verification steps.

### Using it

```bash
# Against a preview deployment, before promoting:
export TEMPLE_API_TOKEN=tera_...          # a real personal API token
scripts/verify-deployment.sh https://<preview>.vercel.app

# Against production, after promoting:
scripts/verify-deployment.sh https://www.temple-era.com
```

The script checks the home page, byte-compares this baseline against the
deployment's spec, and makes an authenticated `/api/v1/me` call. A failure on
either of the last two means **stop, do not promote**.

### Refreshing

Do **not** refresh this file to make a failing check pass — that defeats its
purpose. It should only be regenerated deliberately, after an intentional and
reviewed API change has shipped to production, with the new checksum recorded
above and the reason noted in the commit message.
