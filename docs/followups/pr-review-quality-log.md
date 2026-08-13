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

### PR #66 — `chore(web): split templar login identity from reports_readonly`

Both Archon comments (reviewer guide + code suggestions) raised the identical finding:
disabling `reports_readonly`'s login in the same migration that creates `templar` risks an
outage, since `templar` has no password yet when the old login is revoked. **Plausible in
general, but factually wrong here** — verified directly against prod (`SELECT rolname,
rolcanlogin FROM pg_roles`) that `reports_readonly` was never given a password by the prior
migration (#64), so nothing has ever authenticated as it. There is no live consumer to
interrupt. Archon has no visibility into runtime prod state and reasoned from a generically-
sound assumption that didn't hold in this specific case — a different failure shape than the
prior confirmed false positives (which were wrong about static code/config shape), but the
same root cause: a confident claim that a quick empirical check (here, a live DB query rather
than a compiler run) disproved. Skipped the suggested two-migration split; added an inline
comment explaining why the single-migration order is safe here instead.

Also reconfirms the `push_commands` gap from PR #62: the code-suggestions comment stayed
pinned to the opening commit's marker through this round, only the reviewer guide updated.

### PR #69 — `feat(search): unify AND/OR search syntax across filter boxes` (TEMPLE-57)

One finding, **valid and genuinely subtle** — real application logic, not config shape. The
new shared `parseSearchQuery` normalized (lowercased, stripped accents) at parse time, before
tokenizing. The client-side matcher normalizes both the query and the haystack together, so
that was invisible there — but the server-side global-search router feeds the same parsed
terms straight into a Postgres `ILIKE` built from un-normalized database text. `ILIKE` is
case-insensitive but not accent-folding, so a query like `Élan` was silently reduced to
`elan` and stopped matching the equally-accented stored name. Archon flagged the exact line
(`parseSearchQuery(input.query)` in `search.ts`) and named the mechanism precisely (ILIKE's
case- vs. accent-insensitivity, and the client/server behavioral divergence it created) with
no prompting toward that specific angle. Fixed by moving normalization out of parsing and
into `matchesSearchQuery`'s comparison step, so the server keeps getting terms in their
original casing/accents (matching its pre-existing, correct behavior) while the client
matcher still normalizes both sides. Round 2 came back clean ("No major issues detected").

**Round 3 found a second, independent bug in the same normalization step** after the doc-log
commit re-triggered a review: `normalizeSearchText` strips all non-ASCII, so a term made up
entirely of characters outside its scope (CJK, Cyrillic, emoji) normalizes to `""` —
and `"".includes("")` is always `true`. A positive query like `中文` would silently match
every row; a negative query `-中文` would exclude every row. Archon correctly noted this was a
**regression specifically for the AA tag reference panel**, which previously did plain
`.toLowerCase().includes()` with no non-ASCII stripping and so never had this bug — one of the
two boxes I added to the PR beyond the ticket's original five. Valid and non-obvious: two real
bugs from two separate rounds of review on the same ~80-line utility function, both requiring
reasoning about a specific edge case (SQL collation semantics, then string-emptiness) rather
than surface pattern-matching. Fixed by dropping terms that normalize to empty instead of
letting them silently force a match or an exclusion.

**Round 4 caught the fix's own remaining gap**: a query made up *entirely* of unsupported
characters (e.g. `中文` alone, with no other term) still fell through to "no positive
constraint" and matched every row — indistinguishable from an empty query, which is
misleading since the user did type something. Valid, and a sharper read of the UX than my
own fix: I'd consciously accepted that degenerate case as equivalent to an empty query;
Archon treated the two as meaningfully different states worth handling differently. Fixed by
returning no-match when a query expresses positive intent (a term or OR group) but none of it
survives normalization.

**Round 5 rejected the whole approach the first three rounds had been patched onto**, and was
right to: `normalizeSearchText` stripped *all* non-ASCII wholesale, not just Latin accents —
so literal Cyrillic/CJK text in a raid name or recipe note was being silently deleted from
both sides of the comparison, not folded, a real regression for four of the six unified
surfaces (not just the AA tag panel this time). Archon named both remediation options ("fold
case/diacritics" vs. "preserve non-ASCII") and was correct that the tests added in rounds 3-4
had locked the broken behavior in as intentional. This was the right fix all along — the
prior two rounds treated symptoms (what happens when a term becomes `""`) of a cause this
round finally named directly (why legitimate non-Latin text was becoming `""` in the first
place). Fixed by dropping the wholesale non-ASCII strip entirely, keeping only NFD
diacritic-folding; round 6 (informal, past the nominal 5-round cap, run anyway since the fix
was unambiguous) came back clean: "No major issues detected."

**Overall**: five real, independent, non-obvious findings against one ~80-line utility
function, zero false positives across five rounds — the deepest and most sustained
application-logic review in this log to date, and the first case where a later round openly
overturned an earlier round's own accepted fix rather than finding something new and
unrelated. No `greptile` label on this PR, so Greptile was inactive — Archon was the only
reviewer in play throughout.

### PR #72 — `feat(dashboard): add fallback affordance to SoftRes dashboard column`
Archon: no score line (post-TEMPLE-44), one code suggestion. Claimed
`eventWithSoftres.id` (used to build a Discord message-link fallback,
`https://discord.com/channels/{server}/{channel}/{id}`) "is the Raid Helper event ID, not
a Discord message snowflake," and suggested dropping the message-ID segment to link only
the channel. **False positive**: `event.id` already backs the exact same URL pattern twice
in the same file (`upcoming-events.tsx:229,270` on `main`, pre-dating this PR) for the
primary "sign up in Discord" button — an established, presumably-live pattern, not
something this PR introduced. Raid Helper's API exposes the registration message's own
Discord snowflake as the event ID, which is unsurprising for a bot whose "event" *is* the
message it posted. Rejected without code changes; no `greptile` label, so Greptile was
inactive.

### PR #73 — `feat(raid-helper): add signup snapshot capture via QStash`
Greptile: 3/5, two issues. Archon: no score line, one code suggestion. **Both reviewers
independently converged on the same core finding** — a stale/superseded QStash delivery
race: a message scheduled before a raid gets rescheduled can still be delivered after
`cancelQstashMessage()` is called for it (cancellation isn't atomic with in-flight
delivery), capturing a checkpoint at the wrong real-world moment and then blocking the
correctly-timed replacement via the snapshot table's unique constraint. **Confirmed
real** — verified the race mechanics by hand rather than taking either write-up at face
value, since Greptile's phrasing ("captures signups at the old time") slightly
mischaracterized *what* goes wrong: `captureSnapshot` always re-fetches live data, so the
captured *signups* aren't stale — the problem is the capture fires at the wrong *moment*
relative to the corrected checkpoint target, and that premature row then wins the unique
constraint. Fixed with a staleness guard in the capture route (compare the delivery's
embedded `targetTime` against the currently-active tracking row before capturing; return
200 rather than an error so QStash doesn't retry a delivery being intentionally
discarded) rather than Archon's suggested approach (throw inside `captureSnapshot` on an
`expectedStartTime` mismatch), which would have turned a clean "stale, skip" into a
5xx QStash would keep retrying.

Greptile's second, Archon-unshared finding — the snapshot table's `(raidHelperEventId,
checkpoint)` uniqueness not distinguishing occurrences of a recurring Raid Helper event —
was **verified empirically against the real events API rather than accepted on
description alone**: grouped all 439 fetched events by `id` (zero collisions across 12
active-channel events) and checked all 7 near-term event IDs for the `lastEventId`-needs-
resolution quirk that would signal a reused "channel placeholder" ID (none exhibited it).
The failure mode doesn't currently manifest in this guild's actual usage, but the schema
had no protection if it ever did, so fixed anyway (added `startTime` to the unique index
and to the discovery route's "already captured" check) rather than dismissed — a case
where empirical verification changed the *scope* of the fix (schema-level, not just
route-level) rather than whether to fix it at all.

**Round 2** (score unchanged at 3/5 — same commit range Archon marked "reviewed until
f3a0b39"): both reviewers pushed further on the same recurring-occurrence thread from
round 1, now pointed at the *schedule* table rather than the snapshot table — Greptile
raised it a second time and Archon's Reviewer Guide flagged it independently in the same
round, three total mentions across two reviewers. Traced through the concrete race by
hand (not just pattern-matched against round 1's already-accepted finding) and confirmed
it's real and more severe than "delayed": if Raid Helper ever reused an `id` across two
occurrences, the discovery poll would read the second occurrence's startTime as "the
first occurrence rescheduled" and **cancel the first occurrence's still-valid pending
message**, not just delay it. Deliberately left unfixed anyway, with a long code comment
explaining why: the events-list endpoint alone can't distinguish "this occurrence moved"
from "this is a different occurrence reusing the same id" — resolving that needs a full
detail fetch (for `resolvedEventId`) on *every* listed event on *every* poll, not just
ones with something due, a real API-call-volume cost for a scenario confirmed (round 1)
not to occur in this guild's actual usage today. This is the log's first case of judging
a repeated, multi-reviewer finding as correct *and* still declining to fix it — the
distinction from round 1's sibling finding wasn't "is this real" (both are) but "is a
correct fix cheap enough to be worth taking now," which cuts against the instinct to
treat convergent reviewer pressure as itself a reason to act.

Also fixed a smaller, related gap Greptile raised alongside it: the capture route's
stale-delivery guard only fired when a tracking row existed *and* mismatched, silently
proceeding to capture when the row was simply missing. Analysis showed this specific gap
wasn't independently harmful in the single-occurrence case — the snapshot table's own
`startTime`-inclusive uniqueness (already added in round 1) makes a stale capture attempt
a harmless no-op either way — but widened the guard (`!activeSchedule || mismatch`)
anyway as a zero-cost defense-in-depth change that also skips a redundant Raid Helper
fetch on duplicate deliveries.

**Round 3** (Greptile: 3/5 → 4/5, genuine improvement, not a stall; Archon: one new
finding). Both reviewers independently found the *same* residual gap in round 2's own
stale-delivery fix, from two different angles — Greptile: a reschedule can land during
`captureSnapshot`'s own in-flight Raid Helper fetch, after the pre-check passed but
before the insert commits, so the pre-check alone can't catch it. Archon: a tracking row
can be stale (not yet reconciled by any discovery poll) rather than concurrently raced,
and the same pre-check would pass because nothing has changed it *yet*. Traced both
through by hand and found they're the same underlying flaw wearing two costumes: the
round-2 guard only validated against the app's *own* bookkeeping (the tracking row),
which can itself be wrong or become wrong mid-request, never against Raid Helper's
*actual live data*. Fixed once at the root rather than patching each surface
symptom separately: `captureSnapshot` gained an optional `validateStartTime` hook that
runs against the freshly-fetched live `startTime` *after* the network fetch but *before*
the insert commits, and the capture route now checks the delivery's assumed
`scheduledForStartTime` against that live value instead of only against the DB row read
before the slow part. A single fix closing two reviewers' two differently-explained
findings in one pass is a useful signal in itself: worth checking, when two reports
sound different, whether they're actually the same root cause before writing two patches.

**Rounds 4–8** (Greptile only — Archon stayed clean throughout this stretch; score held
at 4/5 the whole time, which is notable in itself: five consecutive rounds each surfaced
a *new*, real, narrower finding rather than repeating one, so the flat score tracked
"still one open issue" rather than signaling a stall). Every finding across these five
rounds was independently verified real by tracing the actual concurrency path by hand,
not accepted on description alone, and every one was fixed:

- **Round 4**: gap between `validateStartTime`'s live check (round 3's fix) and the
  insert actually committing — a synchronous JS continuation plus one DB round trip, not
  the wide network-fetch-sized window round 3 closed, but still non-zero. Fixed by moving
  the insert into a `db.transaction`, re-reading the schedule row `for("update")`
  immediately before it — real atomicity against a concurrent single-statement UPDATE
  from the discovery route, not just a smaller window.
- **Round 5**: the discovery route's "already captured" lookup was a `Map<checkpoint,
  Date>` — last-write-wins with no `ORDER BY` behind the query. A reschedule can
  legitimately leave two snapshot rows for the same `(event, checkpoint)` at different
  `startTime`s (one from before the move, one after), and the query's unspecified row
  order meant the map could retain the stale one, making discovery misjudge an
  already-captured occurrence as uncaptured. Fixed by tracking the full `Set` of captured
  startTimes per checkpoint and checking membership instead of relying on order.
- **Round 6**: discovery's own `capture-now` branch called `captureSnapshot` with no
  `validateStartTime` at all — unlike the capture route, which has had it since round 3.
  A reschedule landing between discovery's event-list fetch and `captureSnapshot`'s
  separate `fetchEventDetail` call would still get inserted under the new startTime,
  permanently occupying that checkpoint's unique-key slot before its real target time and
  silently suppressing the correctly-timed future capture. Straightforward miss — the
  guard existed in one of two places it needed to.
- **Round 7**: traced to the shared `cleanupStaleSchedule`/`deleteScheduleRow` helper,
  used by three separate branches (`skip-captured`, `skip-missed`, `capture-now`) — its
  delete was scoped to `(event, checkpoint)` only, no check that the row was still the
  specific generation read earlier in the invocation (before any awaits). An overlapping
  discovery invocation — QStash's own at-least-once retry on a timeout is the realistic
  trigger, not just theoretical concurrency — installing a fresh replacement schedule in
  that gap would get it deleted out from under it by every caller of the helper, not just
  the one Greptile named. Fixed at the shared root: scoped the delete to also match
  `qstashMessageId`, making it a no-op once the row has moved on.
- **Round 8** (final round under the raised 8-round cap): same lost-update shape as round
  7, in the sibling `reschedule` branch's `UPDATE` — also keyed only by
  `(event, checkpoint)`. Fixed the same way (match `qstashMessageId` too), plus a small
  addition beyond the minimal fix: when the update affects zero rows (lost the race),
  best-effort cancel the QStash message just published rather than leaving it to dangle
  — not required for correctness (the capture route's existing staleness check discards
  an unrecorded delivery safely on its own), but avoids leaking a scheduled message.

Pattern worth naming: rounds 4, 7, and 8 are the same underlying shape — *read a schedule
row, do slow work (network fetch or QStash publish), then write back based on the stale
read* — recurring across three unrelated call sites (capture insert, cleanup delete,
reschedule update) because the codebase has three places that do read-then-slow-work-
then-write against the same table. Greptile found each occurrence independently rather
than generalizing from the first one; worth checking any *fourth* such site by hand
before trusting it's already covered, rather than assuming three fixes exhausted the
pattern. Round 8 was reached because this session's user explicitly raised the round cap
from 5 to 8 mid-loop — without that, rounds 7 and 8's genuine, distinct findings would
have gone unfixed under the original cap.

### PR #84 — `feat(world-buffs): add world-buff quest turn-in tracking` (TEMPLE-87)
Greptile never produced a check-run across two rounds (label was applied, PR wasn't a
draft) — treated as unavailable both times per the grace-window rule, not as a failed
review. Archon: no score line, two rounds, both **confirmed real**: `getAll` (public
tRPC procedure) returned every status row's full `assignments` relation unfiltered,
leaking completed/dropped turn-in schedules that `listPastAssignments` exists
specifically to gate behind `worldbuff:manage`; and `updateQueueType`/`updateNotes` were
`protectedProcedure` (any authenticated session) despite being manager-only in practice —
the UI only ever calls `updateQueueType` from the manager-gated re-tag menu, and
`updateNotes` had no caller at all. Both fixed: `getAll` now strips `assignments` for
rows whose status is `dropped` (kept for `ready_to_drop` rows, since that data is already
public via `listActiveAssignments` — this also preserved a same-PR feature that reads
`row.assignments` to color a queue-list icon), and both mutations moved to
`scopedProcedure(SCOPE.WORLDBUFF_MANAGE)`.

**Stale-comment gotcha worth flagging for future rounds**: Archon's "Code Suggestions"
comment kept its round-1 diff (tagged to the pre-fix commit) verbatim into round 2,
re-showing the two already-fixed suggestions as if still open — while the separate
"Reviewer Guide" comment *did* refresh (tagged to the fix commit) and correctly dropped
both from its findings. The two comments update independently; take the Reviewer Guide's
commit tag as the freshness signal, not the Code Suggestions comment, and verify against
the actual diff before treating a repeated suggestion as unfixed.

**One recurring finding judged not a bug, both rounds**: `submitAvailability`'s open,
no-ownership-check upsert (any authenticated user can submit for any free-text character
name, including overwriting an existing submission) is the plan's explicit, documented
design — mirrors the recipe catalog's shared-roster model, and is required so pre-raid
recruits with no roster link yet can still submit. Not fixed; reported as a deliberate
rejection rather than an unresolved finding.
