---
description: Stage, commit, push, and open a PR for the current feature work. Handles state detection — safe to run at any point in the process.
argument-hint: [optional commit message hint or feature description]
---

Ship the current work: create a branch if needed, commit, push, and open a PR with the correct label.

## User-provided context

$ARGUMENTS

## Process

Detect the current git state first, then work through the steps below — skipping any that are already complete.

### Step 1: Detect state

```bash
git branch --show-current
git status --short
git log origin/$(git branch --show-current)..HEAD --oneline 2>/dev/null
gh pr list --head $(git branch --show-current) --json number,title,url,labels 2>/dev/null
```

Use the output to determine which of the following steps are needed.

### Step 2: Create feature branch (skip if already on a valid feature branch)

If currently on `main` or a branch that does not match `^(feature|fix|chore|refactor|hotfix|dev|claude)/.+`:

- Infer branch type and name from $ARGUMENTS, the diff, or ask the user.
- `git checkout -b {type}/{kebab-description}`

Valid branch types: `feature`, `fix`, `chore`, `refactor`, `hotfix`, `dev`, `claude`

Do not create a `claude/` branch yourself — it is accepted because Claude Code sessions are handed one, and an existing `claude/` branch should be shipped as-is.

Never push to main.

### Step 3: Stage and commit (skip if no uncommitted changes)

- `git add -A`
- Derive commit message from $ARGUMENTS, branch name, or diff summary.
- Format enforced by commit-msg hook: `type(scope): description`
  - Valid types: `feat`, `fix`, `chore`, `refactor`, `hotfix`, `dev`
  - Example: `feat(raids): add attendance export button`
- `git commit -m "type(scope): description"`

If the pre-commit hook fails (lefthook: oxlint, oxfmt, typecheck), show the error, fix it, and retry. Do not use `--no-verify`.

**Scope the commit message to the app(s) touched.** This is a monorepo — determine which apps changed before writing the message:

```bash
git diff --cached --name-only | cut -d/ -f1-2 | sort -u
```

- Only `apps/web/**` → web scope, e.g. `feat(raids): ...`
- Only `apps/bot/**` → prefix the scope with `bot`, e.g. `fix(bot/handler): ...`
- Both, or root config → use a workspace scope, e.g. `chore(repo): ...`

### Step 4: Push (skip if branch is already up to date on remote)

```bash
git push origin $(git branch --show-current) -u
```

**Pre-push hook note**: The hook runs oxlint, TypeScript checking, and a full build across **both** apps via Turborepo — this can take several minutes. Turbo caches, so unchanged apps replay instantly.

**If the push appears to fail:**

1. **Missing `apps/web/.env`** — the build validates the environment via `@t3-oss/env-nextjs` and fails with `❌ Invalid environment variables`. This is a local setup problem, not a code problem. Populate `apps/web/.env` from `apps/web/.env.example`; do not work around it with `--no-verify`.
2. For real errors (lint, TypeScript, build failures): show the error, fix it, commit the fix, and retry without `--no-verify`.

Never use `--no-verify` for actual lint, type, or build failures.

Note: `pnpm build` no longer runs migrations — `drizzle-kit migrate` moved to an explicit `db:deploy` script in Phase 2 — so a push can no longer mutate a database, and PostgreSQL `NOTICE` output should not appear in hook output at all.

### Step 5: Create PR (skip if an open PR already exists for this branch)

Read `.github/pull_request_template.md` for the expected structure.

**Title**: Concise and user-friendly — not a raw commit message.

**Description**: Follow PR description guidelines from CLAUDE.md:

- _Italics_ for inline code/file references (not backticks)
- 2–4 bullet points max per section
- User-focused (what users see/experience)
- Omit empty sections
- Do not restate the title

**User-facing label logic**:

- Apply `user-facing` label for `feature/` and `fix/` branches
- Skip for `chore/`, `dev/`, `refactor/` branches
- Exception: skip even on feature/fix if changes are exclusively to config files (package.json, .env, lefthook.yml, turbo.json, .claude/, etc.) with no user-visible functionality changed
- **Monorepo exception**: `apps/bot/**`-only changes are almost never `user-facing` — the bot has no UI. Label these only when guild members will notice a behaviour change in Discord (e.g. a different reply, a new thread format), not for internal refactors.

Detect which app(s) a PR touches with:

```bash
git diff --name-only origin/main...HEAD | cut -d/ -f1-2 | sort -u
```

```bash
# For feature/ or fix/ branches:
gh pr create --title "..." --body "..." --label "user-facing"

# For chore/, dev/, refactor/:
gh pr create --title "..." --body "..."
```

### Step 6: Return the PR link

```
[PR #{number}: {title}]({url})
```

Confirm whether the `user-facing` label was applied and why.

## Error handling

- If any step fails, stop and explain what failed before continuing.
- `--no-verify` is only permitted when the sole output is PostgreSQL NOTICE messages from drizzle-kit migrate.
- Never use `--force` without explicit user instruction.
- Never push directly to main.
