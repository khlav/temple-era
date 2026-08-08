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

### PR #61 — `chore(repo): make Archon the primary reviewer, not a thin second opinion` (TEMPLE-44)

**Config generation marker — `gen-2`.** Everything below this line was reviewed under:
`gpt-5.6-terra` primary / `model_weak=gpt-5.6-luna` / `reasoning_effort=high` /
`num_max_findings=5` / no score (`require_score_review` off) / four repo-domain rules in
`EXTRA_INSTRUCTIONS` / `repo_context_files` = root `AGENTS.md` + `docs/archon-review-context.md`.

> ⚠️ **The rounds recorded in this entry ran on full `gpt-5.6`, not Terra.** The primary was
> dropped to `gpt-5.6-terra` on cost near the end of this PR, after those rounds had already
> happened. So the four findings below are evidence about **gpt-5.6**, and are an upper bound
> on what `gen-2` produces, not a measurement of it. The first real `gen-2` data point is the
> next PR reviewed after this one merges. Do not read this entry as a Terra baseline.
Entries above this line are `gen-1` (DeepSeek Pro → Flash → Luna, score-calibrated,
generic instructions, root `AGENTS.md` only) and are **not** comparable — several
variables moved at once, deliberately. Add a marker line like this one whenever the
config changes again.

Round 1, two findings, **both valid, both fixed**. No false positives. No score emitted,
confirming `require_score_review` is off end-to-end.

1. **Wire-contract rule contradicted its own context file.** `EXTRA_INSTRUCTIONS` still said
   the bot is "a thin client over five `/api/discord/*` endpoints" and demanded a
   three-sided edit, while `docs/archon-review-context.md` — added in the same PR — says
   four, with `proxy` carved out as Templar's with no bot call site. Archon read both
   halves of the diff and caught that they disagreed. Correct, and non-obvious: it
   required holding a new prompt and a new context file side by side and noticing the
   contradiction between them.
2. **Authz rule was broader than its own context file.** Instructions made any public
   *read* of raid/attendance data a finding; the context file says much of the site is
   public by design and only writes or user-specific reads warrant scrutiny. Left as-is,
   this would have generated exactly the false positives the PR set out to reduce.

Both were self-inflicted inconsistencies introduced while writing the PR, in the half of
the change (the prompt) that ships separately from the half that documents it (the context
file). Worth noting as a maintenance hazard: those two files now have to agree, and nothing
enforces that automatically.

Fixing (1) also surfaced a third error the reviewer did *not* catch — the first fix
attempt pointed proxy changes at "rule (3)", which is MIGRATIONS, not the Templar freeze.
Found by re-reading the rendered instruction block before committing.

**First genuinely useful Archon round in this log.** Every prior entry is either "no
findings on a trivial diff" or a false positive. Caveat on how much to read into it: the
diff was a reviewer prompt plus its own documentation, which is unusually well-suited to a
reviewer that reasons over text. Still not a test on application logic — that bar, carried
over from TEMPLE-38, remains open.

**Rounds 2–3 (same PR).** Round 2 produced two more findings, both valid, both fixed:

3. **Authz gap — `character` missing from the flagged writes.** The round-1 fix narrowed the
   authz rule to writes, but listed only "user, raid or attendance". `character:manage` is a
   real scope and `docs/archon-review-context.md` already named character data, so a new
   unauthenticated character mutation would have fallen outside the filter entirely. This is
   the only finding in this log so far that describes a real *miss* rather than a wording
   problem — a class of bug the reviewer exists to catch.
4. **The context file contradicted itself.** Round 1's fix was applied to the prompt only.
   The context file still called every public read of raid data a finding, two lines above a
   "Not a finding" paragraph saying the opposite — partially undoing the round-1 fix.

Round 3: **no major issues, no security concerns.** Gate green (`typecheck`, `lint`, `test`,
plus all PR checks). Loop exited clean in 3 rounds.

**Pattern to watch: prompt/context drift.** Three of the four findings were the same defect —
`EXTRA_INSTRUCTIONS` in `archon.yml` and `docs/archon-review-context.md` disagreeing with each
other. That is a structural cost of the split introduced by TEMPLE-44 (short behavioural prompt
in the workflow, versioned knowledge in a doc read from `main`). The split is still right, but
the two files must now be edited as a pair and *nothing enforces that*. Candidate follow-up: a
CI check asserting both name the same procedure types, scopes and data kinds.

**How much to read into this round.** Four valid findings, zero false positives, is by a wide
margin the best Archon showing in this log — but every one of them was in reviewer guidance and
its own documentation, i.e. prose, which is what a text-reasoning model is best at. It is
evidence the config change worked; it is **not** yet evidence on the open question from
TEMPLE-38, which needs a real application-logic diff reviewed under `gen-2`.

Also observed: Archon's **code-suggestions comment went stale** while the reviewer guide
updated. At round 3 the guide carried `56a4491` but the suggestions comment still carried
`a464d4f`, re-showing a suggestion already applied in round 2. `/fix-pr`'s rule of keying
freshness on the check-run SHA rather than comment bodies is what caught this — do not read
the suggestions comment as current without checking its marker.

### PR #62 — `fix(repo): stop the commit-msg WIP check firing on every TEMPLE ticket` (TEMPLE-45)

**Round 1 ran under `gen-1`, not `gen-2`.** The branch was cut from `main` before TEMPLE-44
merged, so this review used the old config — Luna primary, score on (it reported
`4/5 ★★★★☆ (92/100)`). That matters for what follows.

One finding, **valid, and the best single finding in this log to date**: the new WIP pattern
used `[^[:alnum:]]` as its word boundary, which treats `_` as a separator — so
`fix(tmp_config): update loader` and `feat(api): add temp_dir handling` would still warn,
reintroducing the exact false-positive class the PR existed to remove, via a different
separator. Verified empirically before fixing (both warned under the old pattern, both clean
with `_` added, all five genuine markers still firing). Fixed by adding `_` to both boundary
classes.

Precision caveat: its second illustration, `rename_work_in_progress_flag`, does **not**
actually trigger — "work in progress" requires spaces and that string has underscores. The
finding and its primary example are right; one of its two examples was wrong.

**This revises a standing claim in this log.** "Archon is accurate but thin on real
application logic" was the premise behind TEMPLE-38 and TEMPLE-44. Here it caught a genuine
logic bug in shell code — regex boundary semantics, not config shape — under the *old*
config. So the thinness pattern is weaker evidence than it looked, and `gen-2` cannot take
credit for this catch.

**Round 2 was the first `gen-2` (Terra) review of a real code diff.** After merging `main` in
(the branch was `BEHIND`, and strict protection requires it), Terra reviewed the underscore
fix: no major issues, no security concerns, effort 1/5, and **no score emitted** — confirming
`require_score_review` is off end-to-end on a branch that carried the old config minutes
earlier. Clean, but a two-line regex fix is not a depth test either. The open question from
TEMPLE-38 — how `gen-2` handles a substantial application-logic diff — is still open.

**Confirmed across two PRs: `/improve` runs on `opened` only, never on `synchronize`.**
`push_commands` defaults to `['/describe', '/review']`. Evidence: on #61 the suggestions
comment stayed frozen at the opening commit's marker (`<!-- a464d4f -->`) through four later
pushes; on #62 it is timestamped at the `opened` event (`02:16:12`) while the reviewer guide
updated at `02:26:18` for round 2. #62's comment reads "No code suggestions found" because it
was empty at open, not because it re-ran. Consequences: code suggestions only ever describe a
PR's opening commit and silently go stale, and `best_practices.md`,
`suggestions_score_threshold` and `persistent_inline_comments` are inert after the first push.
Adding `/improve` to `github_action_config.push_commands` would fix it, at per-push cost.

**Unrelated friction worth recording:** `git merge origin/main` fails the `commit-msg` hook,
because the default `Merge branch 'main' into ...` message is not conventional format. Local
branch updates need a hand-written conforming message; `gh pr update-branch` avoids it by
merging server-side where no hook runs.
