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

Two things to wait for, per active reviewer: **the check leaving `pending`**,
then **the matching PR comment actually containing the feedback** (checks
confirm completion; comments carry the content).

```bash
gh pr checks "$PR" --json name,bucket \
  --jq '.[] | select(.name=="Greptile Review" or .name=="PR review")'
```

- Present with `bucket` other than `pending` → that reviewer is done; go read
  its comment (Step 4).
- Present and still `pending` → still running, keep polling.
- **Absent entirely after the ~90s grace window** (and `*_EXPECTED=true`) →
  treat as unavailable for this round. Do not keep waiting — proceed on
  whichever reviewer(s) did produce a check, and say so explicitly in the
  final report. This is the answer to "how do we know Greptile didn't run":
  we don't get told why, but the missing check tells us reliably *that* it
  didn't.

Both bots edit a single PR comment in place on later pushes rather than
posting a new one each time, so once the check is non-pending, confirm the
comment actually names the current commit before trusting its content:

**Greptile** posts as `greptile-apps[bot]`, ending with a marker:

```
<sub>Reviews (1): Last reviewed commit: ["dev(bot): rewrite..."](https://github.com/khlav/temple-era/commit/13b959e...)
```

```bash
REVIEWED_GREPTILE=$(gh api "repos/$REPO/issues/$PR/comments" \
  --jq '.[] | select(.user.login=="greptile-apps[bot]") | .body' \
  | grep -o 'commit/[0-9a-f]\{7,40\}' | tail -1 | cut -d/ -f2)
```

**Archon** posts as `github-actions[bot]`, in **two separate comments** — a
reviewer guide and a code-suggestions list. Only the reviewer guide carries
the reviewed-commit marker:

```
#### (Review updated until commit https://github.com/khlav/temple-era/commit/2c0888a60fa2...)
```

```bash
REVIEWED_ARCHON=$(gh api "repos/$REPO/issues/$PR/comments" \
  --jq '.[] | select(.user.login=="github-actions[bot]" and (.body | startswith("## PR Reviewer Guide"))) | .body' \
  | tail -1 | grep -o 'commit/[0-9a-f]\{7,40\}' | tail -1 | cut -d/ -f2)
```

Compare **by prefix, not equality** — `headRefOid` is the full 40-character
SHA, the marker URL may carry an abbreviated one:

```bash
# Use the LOCAL SHA, not `gh pr view --json headRefOid` — GitHub's API lags a
# push by a few seconds, so reading it immediately after `git push` returns
# the PREVIOUS commit, which was already reviewed, and the poll matches
# instantly on stale feedback.
HEAD=$(git rev-parse HEAD)

# Guard the empty case FIRST. With $REVIEWED empty (no comment posted yet —
# the normal state on a fresh PR), the case pattern becomes ""* which matches
# any input, so unguarded this reports "current" on a review that doesn't
# exist yet.
is_current() {
  reviewed="$1"
  [ -z "$reviewed" ] && return 1
  case "$HEAD" in
    "$reviewed"*) return 0 ;;
    *)            return 1 ;;
  esac
}
```

### Poll in the BACKGROUND — never block the session

Both bots take minutes, not seconds. A foreground poll freezes the
conversation that whole time, which is unacceptable when the user may want to
do something else.

Poll **both** reviewers in the same background loop (one `run_in_background`
task, one notification) rather than two separate ones:

```bash
# run_in_background: true
grace_elapsed=0
for i in $(seq 1 20); do
  checks=$(gh pr checks "$PR" --json name,bucket)
  ... for each *_EXPECTED reviewer: if its check is absent and grace_elapsed
      >= 90, mark unavailable and drop it from the wait set; if present and
      non-pending, check is_current on its comment ...
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
