---
description: Wait for Greptile's review on the current PR, apply its feedback, push, and repeat until the confidence score reaches 5/5 (max 5 rounds).
argument-hint: [PR number] [and/or "merge when ready" to authorize auto-merge at 5/5]
---

Iterate on Greptile's review feedback until the PR is clean.

## User-provided context

$ARGUMENTS

## Merge authorization — read this first

**Default: do NOT merge.** Finish the loop, report, and stop.

Merge only if **both** are true:

1. The score reached **5/5**, and
2. $ARGUMENTS contains explicit standing approval — "merge when ready", "merge
   when clear", "merge if it looks good", "auto-merge", or equivalent.

A bare `/fix-pr` or `/ship` is **not** authorization. If unsure, do not merge —
say the PR is ready and ask.

---

## Step 1: Identify the PR

```bash
PR=$(gh pr view --json number --jq .number)   # or use the number in $ARGUMENTS
gh pr view "$PR" --json number,title,headRefName,headRefOid,url
```

If there is no PR for the current branch, stop and say so — this command
operates on an existing PR.

## Step 2: Wait for a review of the *current* commit

Greptile posts one issue comment and edits it in place on later runs, so
"a comment exists" does not mean "the latest push was reviewed."

The comment ends with a marker naming the commit it reviewed:

```
<sub>Reviews (1): Last reviewed commit: ["dev(bot): rewrite..."](https://github.com/khlav/temple-era/commit/13b959e...)
```

Poll until the SHA in that marker matches the PR head:

```bash
HEAD=$(gh pr view "$PR" --json headRefOid --jq .headRefOid)
gh api "repos/khlav/temple-era/issues/$PR/comments" \
  --jq '.[] | select(.user.login=="greptile-apps[bot]") | .body' \
  | grep -o 'commit/[0-9a-f]\{7,40\}' | tail -1
```

Poll about every 30 seconds, up to ~10 minutes. If it never updates, report
that Greptile did not review and stop — do not guess at feedback.

## Step 3: Read the feedback

Three sources, all worth reading:

**a. Confidence score** — the loop's exit condition:

```bash
gh api "repos/khlav/temple-era/issues/$PR/comments" \
  --jq '.[] | select(.user.login=="greptile-apps[bot]") | .body' \
  | grep -oE 'Confidence Score: [0-9]+/5'
```

**b. The issue list** — Greptile embeds a clean, machine-readable copy inside a
`Prompt To Fix All With AI` block, fenced with `` ````` ``. Each issue has a
file path, line number, a bold title, and a rationale. Prefer this over scraping
the rendered HTML.

**c. Inline review comments** — a separate endpoint, easy to miss:

```bash
gh api "repos/khlav/temple-era/pulls/$PR/comments" \
  --jq '.[] | "\(.path):\(.line)  \(.body)"'
```

## Step 4: Judge each issue, then fix

**Do not apply feedback uncritically.** Greptile is a reviewer, not an
authority. For each issue decide:

- **Valid** → fix it.
- **Wrong** → skip it, and say why in your report. A reviewer misreading the
  code is common; changing correct code to satisfy it makes the code worse.
- **Out of scope** → skip. A PR that fixes a doc should not grow a refactor
  because a reviewer noticed something adjacent.

Then verify, using the repo's real gate:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Commit with a message describing the *substance* of the fix, not "address
review feedback" — a reader six months out has no access to the review.

```bash
git commit -m "fix(scope): what actually changed"
git push
```

## Step 5: Loop

Return to Step 2. **Maximum 5 rounds.**

Stop early when any of these is true:

- **Score is 5/5** → done.
- **Score stops improving across two consecutive rounds** → stop. Something is
  not landing; report rather than burning rounds.
- **The only remaining issues are ones you deliberately rejected** → stop and
  report. Do not "fix" things you judged wrong just to move the number.
- **The gate fails and you cannot fix it** → stop and report.

## Step 6: Report

Always report:

- Final score and how many rounds it took
- What you changed, per round
- **What you skipped and why** — this is the part worth reading
- Whether the PR was merged, and under what authorization

## Merging (only if authorized — see the top)

```bash
gh pr merge "$PR" --squash --delete-branch
```

Use `--squash` **unless** the branch contains a commit whose SHA is referenced
somewhere, e.g. `.git-blame-ignore-revs`. Squashing rewrites SHAs and would
silently break the reference; use `--merge` in that case.

If merge is blocked by `mergeStateStatus: BLOCKED`, the branch is likely behind
`main` (protection uses `strict: true`):

```bash
gh pr update-branch "$PR"
```

Then wait for checks again before merging.

## Notes

- The required check is the aggregate **`CI`**; `Web` and `Bot` show `skipping`
  when the path filter excludes them, which is correct, not a failure.
- Greptile also renders "Fix All in Claude Code" / "Fix All in Codex" badges.
  Ignore them — they hand off to an external session. Do the work here.
- A score below 5/5 is not automatically a blocker. Greptile scores confidence,
  and a documentation PR with a nitpick can be perfectly mergeable. Use judgement
  and say what you think.
