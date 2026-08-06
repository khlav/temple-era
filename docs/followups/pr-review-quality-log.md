# PR review quality log — Greptile & Archon

A running record of what each PR reviewer actually got right or wrong, across real
rounds of `/fix-pr`. This exists because "Archon feels less reliable than Greptile" or
"Greptile caught something subtle" are easy to feel and easy to forget — this file is
where that evidence accumulates instead of staying tribal knowledge in one session's
context.

**Why this is separate from `archon.yml`'s inline comments:** that file documents *config*
decisions (why a permission was dropped, why the model was switched). This file documents
*review quality* — whether a given finding was true, false, or just shallow — which is a
different axis and doesn't belong in a workflow file's comments.

## How to use this

- **Before trusting a finding at face value**, skim the entries below for the same file/
  area or the same *kind* of claim (structural/YAML claims, ticket-linking, test-coverage
  callouts) — a pattern here is a reason to verify harder, not to dismiss the finding.
- **After a `/fix-pr` round**, append an entry when something is actually worth recording:
  a finding you independently verified as correct (especially if non-obvious), a finding
  you disproved (a false positive), or a reviewer being notably shallow/deep relative to
  its score. Routine clean rounds with nothing surprising don't need an entry — this is a
  log of signal, not a transcript of every PR.
- **Feeds TEMPLE-11** (recalibrate Archon's score bins) — don't recalibrate off vibes;
  recalibrate off enough rows here to see an actual pattern.

## Patterns observed so far

- **Greptile has been consistently substantive**, including one genuinely subtle catch
  (PR #45) that took manual empirical testing to confirm was real — not a style nit, an
  actual behavioral bug the agent had itself just written and believed was correct.
- **Archon's verdicts have mostly been accurate**, but engagement depth swings widely:
  sharp and detailed when reviewing infra it has a strong prior on (PR #32, reviewing its
  own workflow), thin to the point of "no code suggestions" on straightforward
  application-logic diffs (PR #46) even where Greptile found more to say about the same
  diff. **PR #52 is the first confirmed false positive captured in this log**: a claimed
  Tailwind v4 API-removal (`--color-gray-200` no longer exists) that was factually wrong
  and took under a minute to disprove against the actual compiled CSS.
- **One confirmed Archon false positive predates this log** and is captured directly in
  `.claude/commands/fix-pr.md`'s Step 5 guidance instead of here: a claimed YAML
  indentation bug on structurally valid, already-working config, surfaced on a 65/100-
  scored review. No PR number was recorded for it at the time. Both of Archon's confirmed
  false positives so far are the same shape: a confident claim about the *shape or
  existence* of something (config validity, an API surface) that a 10-second empirical
  check — run the compiler, grep the compiled output — would have disproven.
- **No false negative has been confirmed yet either way** — every discrepancy so far is
  "Archon said less," not "Archon missed a bug that was later proven to exist."

## Log

### PR #32 — `chore(repo): add self-hosted DeepSeek-backed PR review via PR-Agent`
Archon reviewing the workflow that runs it. Caught several real, valid issues in its own
config: a fork-PR guard gap (external PRs would get a red check instead of skipping
cleanly), `contents: write` and `checks: write` both overprivileged relative to what the
workflow actually uses, and `@main` as a supply-chain risk versus pinning by SHA. All
fixed in response. Strong showing, but this is Archon reviewing infra/CI it has maximal
context on (its own setup), not application logic.

### PR #43 — `feat(raids): add recommended database indexes`
Archon: 95/100, ready to merge, no code suggestions. **Not a meaningful quality test** —
3,585 of the diff's 3,605 lines were an auto-generated Drizzle snapshot; the only
hand-written change was ~9 lines of `index(...)` calls mechanically mirroring an
already-written SQL migration. Nothing there for a reviewer to meaningfully catch either
way.

### PR #45 — `chore(repo): add Semgrep security scanning to CI and pre-commit`
**Round 1** — Greptile: 3/5, three findings, all independently verified correct:
1. The pre-commit secrets hook silently fell back to a full-repo scan instead of
   staged-files-only. Root cause was genuinely subtle: lefthook's `scripts:` entries
   never receive staged files as arguments regardless of `glob` (glob only gates whether
   they run) — confirmed via three separate real-commit tests before believing it.
2. SARIF upload would error on a missing file if semgrep crashed before writing it.
3. The `semgrep/semgrep` container image was unpinned (implicit `latest`).

Archon: 95/100, ready to merge, one valid finding — distinguish semgrep exit code 1
(finding) from exit code 2 (semgrep itself failed) rather than treating any non-zero exit
as a secret match. Also correct, also fixed.

**Round 2** (after fixes) — Greptile: 5/5. Archon: 95/100, reviewer guide confirmed
current, no further findings. Both clean.

Notable: this is the strongest evidence so far that Greptile can catch something a human
(the agent, in this case) built, tested locally, and believed was correct.

### PR #46 — `fix(bot/permissions): remove dead isRaidManager fallback`
The TEMPLE-13 spot-check PR — first real `apps/bot`/`apps/web` logic change either bot
had reviewed (everything before it was CI/config or a trivial schema mirror).

Greptile: 5/5. Substantive — correctly traced the actual runtime behavior change (a
future web rollback would now silently deny access instead of consulting the legacy
flag), confirmed that was deliberate and already documented, produced an accurate
sequence diagram of the real code path.

Archon: 98/100, ready to merge. Correct but thin — its only observation was "no relevant
tests" (true: `permissionChecker.ts` has no test file), with no deeper engagement with
the logic change itself and no per-file breakdown.

### PR #52 — `chore(web): upgrade Tailwind CSS 3.4.19 -> 4.3.3`
The official `@tailwindcss/upgrade` codemod did the mechanical lift across ~50 files.

Greptile: 4/5, one valid finding — the codemod reordered the `TableFooter` variant stack
from `[&>tr]:last:border-b-0` to `last:[&>tr]:border-b-0`. These are not equivalent:
verified by grepping the actual compiled CSS output, the rewritten version compiles to
`.last\:\[\&\>tr\]\:border-b-0:last-child > tr`, which strips the border from *every* `tr`
child once `tfoot` itself is `:last-child` (always true), instead of only the actual last
`tr`. No visible regression today since `tfoot` is always single-row in this codebase, but
a real divergence from the original v3 intent and a one-line fix with no downside — fixed.

Archon: 75/100, one finding — claimed Tailwind v4 "no longer exposes `--color-gray-200`
as a custom property," so the codemod's border-color compatibility shim would silently
fall through to `currentcolor` and visibly darken every unstyled border. **False positive,
confirmed in under a minute**: Tailwind v4 ships its full default color palette as CSS
custom properties unless a project explicitly opts out (this one doesn't), and the actual
compiled `globals.css` output contains `--color-gray-200: #e5e7eb` exactly as expected.
Rejected, no change made. See the "Patterns observed" note above — this is the second
confirmed case where the fix was to verify the compiled/generated output rather than
reason about the framework from memory.

**Round 2** (after the `TableFooter` fix) — Greptile: 5/5, no remaining issue block (the
summary prose sloppily referenced the now-fixed `TableFooter` finding by name without
re-verifying it, but there was no actionable `### Issue` entry backing that mention — the
score and the absence of a fix-it block are the authoritative signal, not the narration).
Archon: 92/100, "Ready to merge," no major issues detected — did not re-raise the
`--color-gray-200` finding, consistent with it having been a genuine false positive rather
than something it was simply waiting to see fixed. Both clean.

### PR #53 — `chore(repo): add generic PR-merged webhook for external ticket automation`
Greptile: not run — PR has no `greptile` label.

Archon: 85/100, one suggestion — claimed `pr_number` "can be a string... the downstream
consumer expects a numeric value," proposing to switch `--argjson pr_number "$PR_NUMBER"`
to `--arg` + `| tonumber`. **Self-contradicting on inspection**: `--argjson` already parses
the env var as a JSON number today (`PR_NUMBER` is always a bare digit string, from either
`workflow_dispatch`'s default or the real event's `.number`), so the payload is already
numeric — and Archon's own "Suggestion importance" footnote says exactly that, rating its
own suggestion 2/10 and calling the change "unnecessary... negligible impact." Rejected, no
change made. Notable mainly for the shape: a top-level finding and its own nested rationale
disagreeing with each other, rather than the finding itself being subtle either way.

### PR #59 — `chore(repo): trial GPT-5.6 Luna as Archon's primary review model` (TEMPLE-38)
First PR reviewed under GPT-5.6 Luna as Archon's primary model, swapped in from
`deepseek/deepseek-v4-pro` (see `.github/workflows/archon.yml`).

Archon: 88/100, "Ready to merge," no findings, no code suggestions.

**Not a meaningful depth test** — same caveat as PR #43: the diff is the model-swap
config change itself, with essentially no application logic for a reviewer to engage
with either way. TEMPLE-38's actual "done when" bar (a real application-code PR
reviewed by both, to compare depth against the DeepSeek baseline) is still open; this
entry is only a baseline data point that Luna produces a plausible score on a trivial
diff, not evidence either way on the review-depth question the ticket exists to answer.
