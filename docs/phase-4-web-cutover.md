# Phase 4 — Web cutover runbook

Repoint the **existing** Vercel project at the monorepo. ~20 minutes.

Everything here happens in the Vercel dashboard. Nothing in this repo changes.

> **Do not create a new Vercel project.** The existing one holds `temple-era.com`,
> all 44 environment variables, and both `DATABASE_URL`s. A new project starts with
> none of them, and a hand-retyped production `DATABASE_URL` is the one mistake in
> this migration that isn't recoverable.

---

## Before you start

- Project: **`temple-raids-t3`** under the **Temple Era** team
- Current settings are recorded in `docs/baselines/vercel-project-export.md` — that
  is the rollback reference
- Production is currently served from `khlav/temple-raids-t3` and stays that way
  until you promote

---

## Step 1 — Change four settings

Vercel → project `temple-raids-t3` → **Settings**.

### 1a. Git repository

**Settings → Git → Connected Git Repository → Disconnect**, then connect
**`khlav/temple-era`**. Production branch stays `main`.

### 1b. Build & Development Settings

| Field | Set to | Currently |
|---|---|---|
| **Root Directory** | `apps/web` | *(empty)* |
| **Include source files outside of the Root Directory** | ✅ **on** | already on |
| **Build Command** | `pnpm build && pnpm --filter temple-raid-t3 db:deploy` | *(empty — override OFF)* |
| Install Command | leave empty | empty |
| Output Directory | leave empty | empty |

You must toggle **Override** on for the Build Command field before typing into it.

> ### ⛔ The Build Command is the one that matters
>
> Migrations used to run automatically as a `postbuild` side effect of `next build`.
> Phase 2 moved them to an explicit `db:deploy` script, so **nothing runs migrations
> unless this field says so.**
>
> Skip it and the deploy goes **green** while serving new code against an old
> database schema. You find out from a runtime error, not a build failure. This is
> the only step here that fails silently.

### 1c. Ignored Build Step

**Settings → Git → Ignored Build Step** → Override → `npx turbo-ignore`

Without this, every bot-only commit triggers a full web production deploy.

---

## Step 2 — Get a preview deployment

Push any trivial change to a branch and open a PR, or use **Deployments →
Redeploy** on a non-production branch.

Wait for it to build. **Do not promote yet.**

If the build fails, that's the expected kind of failure — see Troubleshooting.

---

## Step 3 — Verify the preview

Copy the preview URL, then run:

```bash
cd /Users/kirkhlavka/workspace/repos/temple-raids/temple-era
VERCEL_AUTOMATION_BYPASS_SECRET=$(cat ~/.temple-era-vercel-bypass) \
  ./scripts/verify-deployment.sh https://<preview-url>.vercel.app
```

This checks three things:

1. **Home page renders**
2. **`/api/v1/openapi.json` is byte-identical** to the pre-cutover production
   baseline — the external Templar bot generates its client from this
3. **An authenticated `/api/v1/me` call succeeds** — **the Templar gate**

Check 3 needs the API token file. If you haven't created it:

```bash
read -rs t && printf '%s' "$t" > ~/.temple-era-token \
  && chmod 600 ~/.temple-era-token && unset t
```

**A skipped check 3 is not a passed check 3.** It is the only thing standing
between you and silently breaking a consumer you cannot see.

### Also confirm the migration actually ran

In the preview's **Build Logs**, search for `drizzle-kit`. You should see the
migrate step run after the Next.js build.

`NOTICE: schema already exists, skipping` lines are **normal** — idempotent
migration notices, not errors. Only the exit code matters.

If `drizzle-kit` does not appear at all, the Build Command didn't take. Go back
to 1b.

---

## Step 4 — Check for schema drift *before* promoting

Preview and production use **different databases** (`DATABASE_MIGRATION_URL` has
separate Preview and Production values). A clean preview migration therefore
proves nothing about production.

Compare what each has applied:

```sql
SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 5;
```

Run it against both. If production is missing migrations that preview already
has, the promotion will apply them to production for the first time — which is
fine, but know it's happening rather than discovering it.

---

## Step 5 — Promote

**Deployments → the verified preview → Promote to Production.**

Then verify production itself:

```bash
cd /Users/kirkhlavka/workspace/repos/temple-raids/temple-era
./scripts/verify-deployment.sh https://www.temple-era.com
```

(No bypass needed — the custom domain isn't protected.)

Then click around: home page, a raid page, a character page, log in.

---

## Rollback

Settings change only — no code restore, ~5 minutes:

1. **Settings → Git** → reconnect `khlav/temple-raids-t3`
2. **Root Directory** → clear it
3. **Build Command** → turn Override off
4. **Ignored Build Step** → turn Override off
5. Redeploy the last known-good production deployment

Environment variables, domains, and protection settings are untouched by any of
the above. The old repo is still intact — Phase 6 archives it, and archiving is
reversible.

---

## Troubleshooting

**Install fails on `lefthook install`**
The root `package.json` has `"prepare": "lefthook install"`, which runs on every
install. The `LEFTHOOK` env var exists to suppress it (Production + Preview). If
this still bites, add `LEFTHOOK=0` or set Install Command to
`pnpm install --ignore-scripts`.

**Build can't find files outside `apps/web`**
"Include source files outside of the Root Directory" got switched off. It must be
on — the lockfile and workspace manifest live at the repo root.

**`turbo-ignore` skips the very first build**
It compares against a previous deployment and this repo has none. Redeploy with
"use existing build cache" **off**, or temporarily clear the Ignored Build Step
for the first deploy.

**Verification says "blocked by Vercel Deployment Protection"**
The bypass secret is missing or wrong. It lives at `~/.temple-era-vercel-bypass`.
Don't disable protection to work around this.

**Check 2 fails — spec differs**
Stop. The script prints which endpoints were added or removed. Any difference
means Templar's generated client no longer matches. Do not promote.

---

## When it's done

- [ ] Four settings changed
- [ ] Preview built, `drizzle-kit` visible in its logs
- [ ] `verify-deployment.sh` green on the preview, **including check 3**
- [ ] Promoted, production verified, site clicked through
- [ ] Bot still posting raids (it's still on the old repo — unaffected, but confirm)

Then **Phase 5**: the bot. Dockerfile rewrite, local `docker build`, repoint
Northflank, watch one real raid post.
