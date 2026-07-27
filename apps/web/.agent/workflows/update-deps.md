---
description: Update project dependencies reliably using pnpm. Supports updating all outdated packages or a specific package.
---

This workflow automates the process of updating dependencies, verifying project stability, creating a feature branch, and opening a Pull Request.

## Prerequisites

- `pnpm` must be installed.
- Repository must be a git repository.
- `gh` CLI must be installed and authenticated.

## Process

### Step 1: Detect and Ensure Clean Git State

Before starting, ensure there are no uncommitted changes.

```bash
git status --short
```

If there are uncommitted changes, ask the user to commit or stash them.

### Step 2: Create Feature Branch

Following the project's branching strategy, create a new branch for the dependency updates.

```bash
git checkout -b chore/update-deps-$(date +%Y%m%d)
```

If updating a specific package:

```bash
git checkout -b chore/update-<package-name>-$(date +%Y%m%d)
```

### Step 3: Identify Outdated Packages

Check which packages have available updates.

```bash
pnpm outdated
```

### Step 4: Perform Update

#### Option A: Update All Packages

// turbo

```bash
pnpm update
```

#### Option B: Update Specific Package

// turbo

```bash
pnpm update <package-name>
```

### Step 5: Verify Stability

Run checks to ensure the updates didn't break anything.

// turbo

```bash
pnpm check
```

// turbo

```bash
pnpm build
```

> [!IMPORTANT]
> The `postbuild` script runs `drizzle-kit migrate`, which may output PostgreSQL `NOTICE` messages. These are NOT errors. Only the exit code matters.

### Step 6: Commit and Push

If verification passes, commit the changes and push the branch.

```bash
git add pnpm-lock.yaml package.json
git commit -m "chore(deps): update dependencies"
git push origin $(git branch --show-current) -u
```

If a specific package was updated:

```bash
git commit -m "chore(deps): update <package-name>"
git push origin $(git branch --show-current) -u
```

### Step 7: Create Pull Request

Open a PR for the changes. Do not use the `user-facing` label for dependency updates unless there are functional changes.

```bash
gh pr create --title "chore(deps): update dependencies" --body "Updates project dependencies to their latest compatible versions. Verified with \`pnpm check\` and \`pnpm build\`."
```

If a specific package was updated:

```bash
gh pr create --title "chore(deps): update <package-name>" --body "Updates \`<package-name>\` to the latest compatible version. Verified with \`pnpm check\` and \`pnpm build\`."
```

### Step 8: Rollback (if needed)

If `pnpm check` or `pnpm build` fails, rollback the changes and switch back to the original branch.

// turbo

```bash
git checkout .
git checkout -
pnpm install
```

## Error Handling

- If `pnpm update` fails, investigate the conflict or peer dependency issue.
- If verification fails, always rollback before reporting the error to the user.
- If the PR cannot be created, ensure the branch was pushed successfully.
