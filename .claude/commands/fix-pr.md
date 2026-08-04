---
description: Wait for Greptile's and Archon's reviews on the current PR, apply their feedback, push, and repeat until both are clean or unavailable (max 5 rounds).
argument-hint: [PR number] [and/or "merge when ready" to authorize auto-merge at clean]
---

Iterate on Greptile's and Archon's review feedback until the PR is clean.

## User-provided context

$ARGUMENTS

## Merge authorization — read this first

**Default: do NOT merge.** Finish the loop, report, and stop.

Merge only if **both** are true:

1. Every *active* reviewer is clean (see Step 6's exit conditions), and
2. $ARGUMENTS contains explicit standing approval — "merge when ready", "merge
   when clear", "merge if it looks good", "auto-merge", or equivalent.

A bare `/fix-pr` or `/ship` is **not** authorization. If unsure, do not merge —
say the PR is ready and ask.

---

## Step 1: Identify the PR

```bash
REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
PR=$(gh pr view --json number --jq .number)   # or use the number in $ARGUMENTS
gh pr view "$PR" --json number,title,headRefName,headRefOid,url
```

Capture `$REPO` rather than hardcoding the owner/name — the same command file
should keep working in a fork or after a rename.

If there is no PR for the current branch, stop and say so — this command
operates on an existing PR.

## Step 2: Determine which reviewers are actually in play

Neither bot always runs, and there is no reliable message that says "out of
credits" — but **both post a named check on the commit**, not just a PR
comment, and that check is the tell:

```bash
gh pr checks "$PR" --json name,bucket
```

- `Greptile Review` — Greptile's own check-run (linked to greptile.com).
- `PR review` — Archon's GitHub Actions job (the workflow *is* the check).

Greptile is **opt-in**: it only reviews a PR that carries the **`greptile`**
label (`greptile.json`'s `labels` field — see the root `AGENTS.md`). No label
means no check will ever appear, by design — that's a normal "not expected",
not something to wait out. `no-greptile` is not a real label anymore; ignore
it if you see it lying around on an old PR. A draft PR also skips Greptile
regardless of the label. Archon has its own, unrelated gate — a fork PR trips
its fork guard in `archon.yml`:

```bash
LABELS=$(gh pr view "$PR" --json labels --jq '.labels[].name')
IS_DRAFT=$(gh pr view "$PR" --json isDraft --jq .isDraft)
IS_FORK=$(gh pr view "$PR" --json isCrossRepository --jq .isCrossRepository)

GREPTILE_EXPECTED=false
echo "$LABELS" | grep -qx "greptile" && GREPTILE_EXPECTED=true
[ "$IS_DRAFT" = "true" ] && GREPTILE_EXPECTED=false

ARCHON_EXPECTED=true
[ "$IS_FORK" = "true" ] && ARCHON_EXPECTED=false
```

With `GREPTILE_EXPECTED=true` (the `greptile` label is present and it's not a
draft), the check can still just never show up — that **is** the out-of-
credits/app-error signal, and Step 3's poll treats it that way: if `Greptile
Review` hasn't appeared in `gh pr checks` within a short grace window (~90s,
well before any legitimate review would even start resolving), stop waiting
on it and proceed without it. This is a much harder signal than a comment
never posting, since a check-run is either registered against the commit or
it isn't — no ambiguity about which push it covers.

## Step 3: Wait for a review of the *current* commit

Freshness and completion are **one signal, not two**: query check-runs scoped
directly to the current commit SHA. A check-run's `head_sha` is set by GitHub
itself, not inferred from bot-authored comment text, so there is no separate
"is this comment about my commit" step to get wrong:

```bash
HEAD=$(git rev-parse HEAD)
gh api "repos/$REPO/commits/$HEAD/check-runs" \
  --jq '.check_runs[] | select(.name=="Greptile Review" or .name=="PR review") | {name, status, conclusion}'
```

- `status: "completed"` → that reviewer is done *for this exact commit*; go
  read its comment (Step 4) — no additional freshness check needed on the
  comment itself.
- `status` present but not `"completed"` (`"in_progress"`/`"queued"`) → still
  running, keep polling.
- **Absent entirely after the ~90s grace window** (and `*_EXPECTED=true`) →
  treat as unavailable for this round. Do not keep waiting — proceed on
  whichever reviewer(s) did produce a check, and say so explicitly in the
  final report. This is the answer to "how do we know Greptile didn't run":
  we don't get told why, but the missing check tells us reliably *that* it
  didn't.

Once a reviewer's check-run is `completed` for `$HEAD`, its comment is safe to
read at face value:

- **Greptile** posts as `greptile-apps[bot]`, one comment, edited in place on
  later pushes.
- **Archon** posts as `github-actions[bot]`, in **two separate comments** — a
  reviewer guide and a code-suggestions list, also edited in place.

> Do **not** rely on comment-body commit markers for freshness (Greptile's
> `Last reviewed commit: ...`, Archon's `Review updated until commit ...`).
> Archon in particular only writes that marker starting on a **re-review**
> (round 2+) — a first-round comment carries no marker at all, so a check
> keyed on it finds an empty string forever and polls out the full window
> even though the review completed within seconds. The check-run SHA above
> doesn't have this gap; use it exclusively for staleness.

```bash
# Use the LOCAL SHA, not `gh pr view --json headRefOid` — GitHub's API lags a
# push by a few seconds, so reading it immediately after `git push` can
# return the PREVIOUS commit.
```

### Poll in the BACKGROUND — never block the session

Both bots take minutes, not seconds. A foreground poll freezes the
conversation that whole time, which is unacceptable when the user may want to
do something else.

Poll **both** reviewers in the same background loop (one `run_in_background`
task, one notification) rather than two separate ones:

```bash
# run_in_background: true
HEAD=$(git rev-parse HEAD)
grace_elapsed=0
for i in $(seq 1 20); do
  runs=$(gh api "repos/$REPO/commits/$HEAD/check-runs" \
    --jq '.check_runs[] | select(.name=="Greptile Review" or .name=="PR review") | "\(.name)=\(.status)"')
  ... for each *_EXPECTED reviewer: if its check-run is absent from $runs and
      grace_elapsed >= 90, mark unavailable and drop it from the wait set;
      if present with status=="completed", it's done — drop it from the wait
      set (no comment-marker check needed, head_sha already ties it to $HEAD) ...
  if [ wait set empty ]; then echo "REVIEWS READY (or unavailable)"; exit 0; fi
  sleep 30; grace_elapsed=$((grace_elapsed + 30))
done
echo "TIMEOUT — a check appeared but stayed pending the whole window; report as a stall, not as unavailable"
```

Do **not** chain `sleep` calls in the foreground, and do not sit in a polling
loop waiting. If the user asks about status mid-wait, read the task's output
file rather than starting a second poll.

A full-loop timeout is a *different* case from the grace-period "unavailable"
above: it means a check-run **did** appear and start, but never finished —
report that as a possible stall in the reviewer's own infrastructure, not as
"out of credits."

## Step 4: Read the feedback

**Greptile** — three sources, all worth reading:

```bash
# a. Confidence score — the loop's exit condition for this reviewer
gh api "repos/$REPO/issues/$PR/comments" \
  --jq '.[] | select(.user.login=="greptile-apps[bot]") | .body' \
  | grep -oE 'Confidence Score: [0-9]+/5'
```

- **b. The issue list** — embedded inside a `Prompt To Fix All With AI` block,
  fenced with `` ````` ``. Each issue has a file path, line number, a bold
  title, and a rationale. Prefer this over scraping the rendered HTML.
- **c. Inline review comments** — a separate endpoint, easy to miss:
  ```bash
  gh api "repos/$REPO/pulls/$PR/comments" \
    --jq '.[] | "\(.path):\(.line // .original_line)  \(.body)"'
  ```
  `.line` is null on comments anchored to an outdated diff position — fall
  back to `.original_line` or those comments render as `null`.

**Archon** — two comments:

- **Reviewer guide** — a `Score: N/100` figure (sometimes also rendered as
  `X/5 ★★★☆☆ (N/100)`, sometimes as bare `N` without the conversion — parse
  the `/100` number, it's the reliably-present one). `Recommended focus
  areas for review` contains one `<details>` block per finding: a title, a
  file/line link, and a rationale paragraph.
- **Code suggestions** — a separate comment, one `<details>` block per
  suggestion with a title, a \`\`\`diff\`\`\` fence (the actual proposed
  change), and an "importance" score 1–10. Only the diff fence is the
  suggestion — the rest is rationale.

## Step 5: Judge each issue, then fix

**Neither bot is an authority — for each issue from either one, decide:**

- **Valid** → fix it.
- **Wrong** → skip it, and say why in your report. A reviewer misreading the
  code is common; changing correct code to satisfy it makes the code worse.
  Archon in particular has produced a confirmed false positive (a claimed
  YAML indentation bug on structurally valid, already-working config) even
  on a 65/100-scored review — verify structural claims against the actual
  file, don't take them on faith.
- **Out of scope** → skip. A PR that fixes a doc should not grow a refactor
  because a reviewer noticed something adjacent.

Before taking a finding on faith either way, check
`docs/followups/pr-review-quality-log.md` for a prior entry on the same kind
of claim (structural/YAML claims, ticket-linking, test-coverage callouts) —
this repo's own review history, not a general reputation for either bot.
After judging, append an entry there if something is actually worth
recording: a finding you independently verified as correct (especially if
non-obvious), one you disproved, or a reviewer being notably shallow or deep
relative to its score. A routine clean round with nothing surprising doesn't
need an entry.

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

## Step 6: Loop

Return to Step 3. **Maximum 5 rounds.**

Exit when, for every reviewer that is *active* (per Step 2 — an inactive or
unavailable one never blocks; treat it as satisfied and say why in the
report):

- **Greptile**, if active: confidence score is **5/5**.
- **Archon**, if active: score is **> 90/100** — a *candidate* for being done,
  not an automatic pass — **and** no valid, unfixed finding remains, **and**
  the gate (Step 5) is green. All three, not the score alone: a 92 with an
  unresolved valid issue still isn't done. 90 is stricter than Archon's own
  self-calibration (see `.github/workflows/archon.yml`'s `EXTRA_INSTRUCTIONS`,
  which treats 80+ as "ready to merge") — this repo's bar for *this loop's*
  auto-exit is higher than what Archon considers clean on its own.

Also stop early when any of these is true, same as before:

- **Both active scores stop improving across two consecutive rounds** → stop.
  Something is not landing; report rather than burning rounds.
- **The only remaining issues are ones you deliberately rejected** → stop and
  report. Do not "fix" things you judged wrong just to move the number.
- **The gate fails and you cannot fix it** → stop and report.

## Step 7: Report

Always report:

- Final score(s), per active reviewer, and how many rounds it took
- Which reviewer(s) were skipped or went unavailable, and why (label, draft,
  fork, or timeout)
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

- The required check is the aggregate **`Review and finalize`** (renamed from
  `CI`); the per-app jobs `Validate web` / `Validate bot` show `skipping` when
  the path filter excludes that app, which is correct, not a failure.
- Greptile also renders "Fix All in Claude Code" / "Fix All in Codex" badges.
  Ignore them — they hand off to an external session. Do the work here.
- A below-max score is not automatically a blocker for either bot. Both score
  confidence, not correctness, and a low-risk config/doc PR with a nitpick can
  be perfectly mergeable. Use judgement and say what you think — this applies
  per-reviewer, not just in aggregate.
- There is no explicit "out of credits" message from either bot — Step 2/3's
  check-run-absence detection exists specifically because that failure mode
  is silent. If a run ever *does* surface an explicit error (e.g. a failed
  `Greptile Review` check, not just a missing one), report the actual error
  instead of guessing at credits — a `failure` conclusion and a check that
  never appeared are different problems.
