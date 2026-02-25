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

If currently on `main` or a branch that does not match `^(feature|fix|chore|refactor|hotfix|dev)/.+`:

- Infer branch type and name from $ARGUMENTS, the diff, or ask the user.
- `git checkout -b {type}/{kebab-description}`

Valid branch types: `feature`, `fix`, `chore`, `refactor`, `hotfix`, `dev`

Never push to main.

### Step 3: Stage and commit (skip if no uncommitted changes)

- `git add -A`
- Derive commit message from $ARGUMENTS, branch name, or diff summary.
- Format enforced by commit-msg hook: `type(scope): description`
  - Valid types: `feat`, `fix`, `chore`, `refactor`, `hotfix`, `dev`
  - Example: `feat(raids): add attendance export button`
- `git commit -m "type(scope): description"`

If the pre-commit hook fails (lint-staged), show the error, fix it, and retry. Do not use `--no-verify`.

### Step 4: Push (skip if branch is already up to date on remote)

```bash
git push origin $(git branch --show-current) -u
```

**Pre-push hook note**: The hook runs ESLint, TypeScript checking, and a full Next.js production build — this can take several minutes.

**If the push appears to fail:**

1. Check the output carefully. The `postbuild` script runs `drizzle-kit migrate`, which produces PostgreSQL `NOTICE` messages (e.g. "schema already exists, skipping"). These are **not errors** — they are normal and the exit code will still be 0. If NOTICE messages are the only output and there are no real lint/type/build errors, the push succeeded. If it still reports failure with only NOTICE output, retry with `--no-verify`.
2. For real errors (lint, TypeScript, build failures): show the error, fix it, commit the fix, and retry without `--no-verify`.

Never use `--no-verify` for actual lint, type, or build failures.

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
- Exception: skip even on feature/fix if changes are exclusively to config files (package.json, .env, .husky, .claude/, etc.) with no user-visible functionality changed

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
