# Raid Log Audit: Refreshing Incomplete WCL Imports

Use this when asked to check or recalculate raid kill data — Naxxramas weekly performance, **or any 40-man zone's per-raid clear depth** (AQ40/BWL/MC: see "Per-raid zone-clear audit" below). Ready-to-run SQL for the non-Naxx sweep: `templates/zone-clear-audit.sql`.

## Why This Exists

Temple's WCL log import is unreliable — single continuous log files sometimes only partially import (e.g., 3/15 kills showing when 15/15 was killed). Confirmed with raid 593 (log h9G3pVyDwRcgL62q). The `characterStatus`/`familyStatus` attendance data is accurate; the `kills` array on `raids.logs` is not.

## Cost rule — count the calls before firing any batch

`POST /raids/{id}/refresh-logs` is **per-raid; there is no batch endpoint.** Every refresh is one live WCL re-fetch, so batch cost is linear in the number of raids.

- **Count first.** Run the identification query, count the suspects, project `raids × ~4-10s`. A guild-wide sweep (70 suspects) is 6-15 minutes — not a quick job.
- **Treat a stated budget literally.** Raid leads have said "if you project this takes more than 5 minutes, do not do it." When the projection is over: **stop, and report the count + the full list + the projection.** Do not start and do not trim the list silently. Then let the lead choose the scope — state the projection and take their call; don't assume ~30 is a hard ceiling (see the 52-raid note below).
- **Name the raids before firing.** Refresh is a write. Show raid IDs + dates, get the go-ahead, then run.
- **Once the count is inside the budget, just run it.** Don't restate the caveat or re-offer a smaller window — if the count is already under the line, the caveat is noise. A raid lead answered a re-offered window with "WHY NOT". State the count, confirm it's inside the cap, fire.
- **Parallel, not sequential.** Multiple `refresh-logs` calls in one tool block are independent and execute concurrently — that is what keeps a 18–21-raid batch comfortably inside 5 minutes. Fire ~9–11 per block, read the returned log IDs, then the next block. Measured (Sep 2026): 18 calls and 21 calls, 39 total, zero failures, all fast. ~30 raids fits the cap; 70 does not — that split is the whole reason the per-week framing matters.
- **The practical ceiling is higher than the old ~30 note — the gate is "report first", not a hard cap.** Confirmed Sep 15 2026: a **52-raid** sweep fired as 5 blocks of 10–11 returned a log ID for all 52 with zero failures and no timeouts. What matters is sequence, not the magic number: identify → count → show the full list + projection → get the go-ahead → fire in parallel blocks. Presented that way, the lead greenlit all 52 on a single "run all 52" reply, no pushback and no re-offered smaller window. Do NOT hedge or shrink the list yourself; the lead chooses the scope.
- Refresh does not guarantee change — a genuine 6-boss night stays at 6. Say that up front rather than after.

## Workflow

### Step 1 — Identify suspect raids (SQL first)

Prefer the read-only SQL tool over GraphQL: one query replaces a full paginated sweep, and the recipes are in `references/db-query.md` (§8 per-raid and lockout-week, incl. the 15-boss filter and the `kills`-spans-zones trap). GraphQL fallback if SQL is unavailable:

```graphql
query { raids(from: "2026-01-01", zones: [NAXXRAMAS]) { id date name logs { killCount kills } } }
```

**Two framings, two different lists — ask which is meant if unclear:**

| Framing | One row per | Measured (Sep 2026 sweep) |
|---|---|---|
| **Per raid** — "every Tuesday Naxx under 15 bosses" | raid | 111 Tuesday Naxx raids all-time → 70 under 15 |
| **Per lockout week (Tue→Mon)** — "weeks that didn't kill 15 in Naxx" | week | same data → 24 weeks |

**The per-week framing is the better audit.** A Tuesday reading 11 is frequently completed by a Mon/Wed/Sat cleanup night that is already inside the week's total — so the per-raid list massively overstates the problem. Pull refresh candidates from the per-week shortfall, not the per-raid list.

Two exclusions to state explicitly rather than silently:
- Weeks with **zero** Naxx logged (e.g. the week of 2024-12-24) are an *absence*, not a short clear — report separately.
- Weeks whose only nights were **not** Tuesdays (e.g. week 2026-07-21 = Fri 07/24 + Sun 07/26) still belong to the Tue→Mon lockout; don't drop them for lacking a Tuesday.

### Step 1b — Per-raid zone-clear audit (AQ40 / BWL / MC — the "fewer bosses than the max" request)

Used Sep 15 2026 for "determine every aq40, bwl and MC which has fewer bosses killed than the maximum in that instance, and refresh all of those." Note this is the **per-raid** framing, asked for explicitly — don't steer a lead toward the per-week view when they've named raids; just note the caveat and run what they asked for. Same refresh mechanics, different target set.

**Zone clear targets** (max = the full boss list, exact stored `kills` strings):

| Zone (`raid.zone`) | Max | Bosses |
|---|---|---|
| `Molten Core` | 10 | Lucifron, Magmadar, Gehennas, Garr, Baron Geddon, Shazzrah, Sulfuron Harbinger, Golemagg the Incinerator, Majordomo Executus, Ragnaros |
| `Blackwing Lair` | 8 | Razorgore the Untamed, Vaelastrasz the Corrupt, Broodlord Lashlayer, Firemaw, Ebonroc, Flamegor, Chromaggus, Nefarian |
| `Temple of Ahn'Qiraj` | 9 | The Prophet Skeram, Silithid Royalty, Battleguard Sartura, Fankriss the Unyielding, Viscidus, Princess Huhuran, Twin Emperors, Ouro, C'Thun |
| `Naxxramas` | 15 | Naxx list above / `db-query.md` §8 |

Ready-to-run SQL (all four zones pre-loaded, plus the counts-only projection variant and the post-refresh re-check): `templates/zone-clear-audit.sql`. Three hard-won details:

- **Filter kills to the target zone's list, always.** Raw `unnest(kills)` counts are junk for mixed-zone nights — 6 BWL-tagged logs carry MC bosses, 5 carry Onyxia, 1 AQ40 log carries Naxx bosses. Unfiltered, those nights read as over-clears.
- **`cross join lateral unnest(rl.kills) as k(bossname)`** — a bare `count(distinct k)` against `z.boss = any(rl.kills)` fails with `column "k" does not exist`, because the alias only exists when the unnest is in the FROM. Count `distinct bossname`, never `count(*)`.
- **Report per-zone totals, not one number.** "52 short — AQ40 27, BWL 16, MC 9" tells a lead far more than 52 alone, and lets them scope by zone.

Population at Sep 15 2026: MC 175 raids / BWL 186 / AQ40 144 all-time.

### Step 2 — Refresh each suspect raid

```python
POST /raids/{raidId}/refresh-logs
```

Returns `{"refreshed": ["logId"]}`. The endpoint re-syncs from WCL.

### Step 3 — Re-query and compare

Check the raid detail after refresh to see if kills changed:

```python
GET /raids/{raidId}
```

If kill count increased, the original import was incomplete. If unchanged, the partial clear was genuine.

### Step 4 — Recalculate

After refreshing all suspect raids, re-query the full dataset and recalculate. Categories:

- **Full Clear** (one-night): First raid of the lockout week was 15/15
- **OK**: KT killed within the lockout via cleanup/second raid
- **Bad**: No KT killed at all that lockout

## Lockout Week Grouping

WoW lockout weeks run **Tue-Mon** (Tuesday through Monday). A Monday raid belongs to the lockout that started the previous Tuesday. A Tuesday raid starts a new lockout.

## Data Presentation

When asked to present per-period Naxx stats, use a stacked ASCII column chart with:
- Most recent period on the right, oldest on the left
- x-axis: period labels (e.g. P9-P1)
- y-axis: row count 1-12, right-aligned labels
- ▓▓ for Full Clear, ▒▒ for OK, blank for Bad
- Exactly 1 space between each 2-char column group

## Results from All Audit Sessions

### Session 1 (Jul 5, 2026) — 9 suspect raids across 2024-2026

**2024 (3 refreshed, 0 changed):**
- Aug 6 (raid 128, 11 kills), Aug 13 (raid 123, 9 kills), Dec 23 (raid 11, 1 kill) — all genuine partials

**2025 (3 refreshed, 0 changed):**
- May 13 (raid 280, 14 kills), Jul 8 (raid 339, 13 kills), Jul 15 (raid 344, 14 kills) — all genuine partials

**2026 (6 refreshed, 5 changed):**
- Jan 20 (raid 593, 3→15 kills), Feb 3 (raid 616, 6→15 kills), May 5 (raid 737, 14→15 kills), Jun 16 (raid 785, 7→15 kills), Jun 23 (raid 790, 7→15 kills) — all fixed
- Mar 24 (raid 678, 14 kills) — unchanged, genuine partial

### Session 2 (Sep 11, 2026) — full-population sweep via SQL

First pass that enumerated the whole population instead of a hand-picked window, using the read-only SQL tool (recipes now in `references/db-query.md` §8):

- **111 Tuesday Naxx raids all-time; 70 show fewer than 15 distinct bosses** (2024: 22, 2025: 32, 2026: 16).
- **Refolded per lockout week (Tue→Mon): 24 weeks short of 15** — 23 short clears, plus the week of 2024-12-24 with no Naxx logged at all.
- The per-week number being far smaller than the per-raid number is the whole lesson: cleanup nights (Mon/Wed/Sat — "Naxx Cleanup 04/27", "Naxx 08/22 Cleanup") fold into the week total. e.g. week 2024-08-27 = raids 107+110 → 14; week 2026-07-21 = Fri 07/24 + Sun 07/26, no Tuesday night at all → 10.
- **No refresh was fired** — the user set a 5-minute budget and 70 sequential refreshes projected well past it. Reported count + full list + projection instead.
- Newly suspicious (week still short *despite* a cleanup night): 2025-11-04 (7), 2025-12-16 (11), 2026-08-18 (5), 2026-07-14 (3).
- Raids 63 (10/29/2024) and 42 (11/05/2024) must be excluded from per-raid Naxx counts — their logs span Naxxramas *and* AQ40, showing 18 and 22 "kills".

### Session 3 (Sep 11, 2026) — the refreshes that followed Session 2

Same day: user greenlit both batches once the count was on the table. **39 raids refreshed, 0 call failures, no week regressed, no new week appeared on the under-15 list.**

**2025–2026 batch (18 raids, fired 9 + 9).** 6 weeks jumped to 15, 6 unchanged:

| Week (Tue) | Before → After | Raids |
|---|---|---|
| 2025-11-04 | 7 → **15** ✅ | 491, 492 |
| 2025-12-16 | 11 → **15** ✅ | 552, 553 |
| 2026-04-21 | 12 → **15** ✅ | 715, 722 |
| 2026-07-14 | 3 → **15** ✅ | 820 |
| 2026-08-18 | 5 → **15** ✅ | 862, 865 |
| 2026-09-08 | 9 → **15** ✅ | 887 |
| 2025-05-13 | 14 → 14 | 280 |
| 2025-07-08 | 13 → 13 | 339 |
| 2025-07-15 | 14 → 14 | 344 |
| 2025-10-28 | 14 → 14 | 478, 490 |
| 2026-03-24 | 14 → 14 | 678 |
| 2026-07-21 | 10 → 10 | 831, 834 |

- **All four of Session 2's "short *despite* a cleanup night" flags were bad imports and all hit 15.** That heuristic — a week still under 15 *with* a cleanup night already folded in — is the strongest predictor of a recoverable import, far better than raw kill count. Use it to rank which weeks to spend refreshes on.
- **The 2026-09-08 week was still open** when Session 2 flagged it at 9 (that Tuesday was 3 days earlier). The refresh showed the full clear was already in WCL. Flag an in-progress week as provisional rather than as a shortfall.
- Weeks reading 13–14 mostly did **not** change — a one-boss gap is usually a real missed boss (KT or Sapphiron), not a truncated import.

**2024 batch (21 raids, fired 11 + 10). 0 of 12 weeks changed** — every value identical before and after.

- The 2024 block is the guild's first months in Naxx (Jul–Sep 2024, climbing 11 → 14) plus the empty Christmas week. Progression, not bad import.
- **Revised spend rule — era matters.** Recent short nights, especially with a cleanup night in the week, are likely recoverable. The earliest Naxx months are likely honest shortfalls. Weight refreshes toward 2025+ and tell the user beforehand that an early-era batch is likely to change nothing.
- Refreshing confirmed rather than fixed: after this batch those 2024 weeks can be labelled "genuine short clear" with evidence, which is itself the useful output.

### Session 4 (Sep 15, 2026) — first non-Naxx sweep: AQ40 + BWL + MC, per-raid framing

Ask: *"determine every aq40, bwl and MC which has fewer bosses killed than the maximum in that instance, and refresh all of those."* Enumerated the full population via SQL (`templates/zone-clear-audit.sql`): **52 raids under max — AQ40 27/144, BWL 16/186, MC 9/175.** Count + the full 52-raid list + projection were reported first (above the 30-raid/~2-min line); lead replied "run all 52".

**Fired as 5 blocks of 10–11 — 52/52 returned a log ID, zero failures, no timeouts.**

Result: **24 fixed to full, 2 improved but still short, 26 unchanged.**

- **Fixed (24):** AQ40 12 — #870 3→9, #861 8→9, #845 1→9, #819 5→9, #786 7→9, #769 6→9, #760 7→9, #688 1→9, #431 5→9, #375 5→9, #368 5→9, #285 3→9 · BWL 8 — #888 2→8, #876 4→8, #868 2→8, #859 4→8, #841 6→8, #787 6→8, #753 4→8, #590 7→8 · MC 4 — #884 2→10, #869 2→10, #860 2→10, #591 4→10
- **Improved, still short (2):** #671 AQ40 4→8, #892 AQ40 2→3
- **Unchanged (26):** AQ40 #409 #323 #181 #165 #122 #19 #50 #90 #147 #14 #144 #77 #558 · BWL #852 #746 #682 #342 #13 #44 #89 #53 · MC #794 #665 #379 #277 #261

Lessons, now confirmed zone-independent:

- **Deep gaps are import failures; 1-boss gaps are real.** 22 of the 24 fixes were gaps of 2+. Of the 13 raids sitting exactly one boss short, only 2 recovered (#861 AQ40 8→9, #590 BWL 7→8). Use "gap ≥ 2" as the ranking heuristic when a lead wants a cheaper first pass — and say the odds before firing, not after.
- **2024 is consistently dead data.** 12 of 12 2024 raids across these zones came back identical (8 AQ40, 4 BWL). Third sweep running where the guild's early months changed nothing — declare that at the outset if an early-era batch is in scope.
- **It's not binary.** A refresh can partially recover (#671 4→8, #892 2→3), so compare the per-raid number after the batch rather than reporting a fixed/unfixed split.
- **`#558` (AQ40 12/20/25) reads 0/9 before *and* after** — its log carries no AQ40 kills at all. That's a wrong-raid log or a placeholder, not a truncated import; refreshing cannot fix it and it needs a human look. Same class as the Naxx "week with zero raids is an absence, not a short clear" distinction.
- Net after the sweep: **28 raids still read under max**. Report the residual count so the lead knows the catalogue isn't empty.

### Does fragmentation affect attendance? No — verified Sep 2026

A raid lead asked whether fragmented logs extend to data shown on the website. Fragmentation is confined to the **boss-kill list**; attendance is untouched. Evidence, and it's decisive:

- Attendee counts (`raid_log_attendee_map` — the log-based ground truth the site's attendance is built on) across **every** 40-man raid: MC min 33, BWL min 36, AQ40 min 39, Naxx min 39. **Zero** 40-man raids below 30 attendees, out of 694.
- The fragmented nights are exactly the low-kill ones with normal attendance: #884 MC 2/10 → 39 attendees; #53 BWL 3/8 → 42; #558 AQ40 0/9 → 40; #868 BWL 2/8 → 40; #892 AQ40 2/9 → 40.
- Mechanism: kills and attendees are independent imports. Attendees are a **union of everyone appearing anywhere in the log**, so losing a segment barely changes who is credited, while the bosses killed in that segment vanish whole. Refreshes only ever move kill numbers.
- Bench (`raid_bench_map`) is roster-side, not WCL-derived — untouched by any import issue.
- ⚠️ The *opposite* failure exists: **#671 (AQ40 03/19/2026) credits 99 distinct attendees** on a 40-man night — its log spans more than AQ40 (18 raw kills, cross-zone), so the union over-credits. Inflation, not loss. Expect it on any mixed-zone night.
- 20-man/other zones legitimately read low (Onyxia min 12, ZG 15, AQ20 19) — small raid size, not truncation. Only judge fragmentation inside the 40-man zones.

### Per-Period Breakdown

**P9: Jun-Aug 2024** — 0 FC, 0 OK, 7 Bad — progression phase, no KT at all
**P8: Aug-Nov 2024** — 0 FC, 9 OK, 3 Bad — KT appears via cleanup only
**P7: Nov-Feb 2024/25** — 0 FC, 11 OK, 1 Bad — cleanup machine, no full clears
**P6: Feb-May 2025** — 6 FC, 6 OK, 0 Bad — first full clears, turning point
**P5: May-Jul 2025** — 6 FC, 3 OK, 3 Bad — worst stretch, 3 missed KT weeks
**P4: Jul-Oct 2025** — 5 FC, 7 OK, 0 Bad — back on track
**P3: Oct-Jan 2025/26** — 4 FC, 7 OK, 1 Bad — solid but cleanup-reliant
**P2: Jan-Apr 2026** — 5 FC, 6 OK, 1 Bad — improving
**P1: Apr-Jun 2026** — 7 FC, 4 OK, 0 Bad — best period, 58% full clears

## Known Affected Log

- Raid 593, log `h9G3pVyDwRcgL62q` — single WCL file with 15 kills, Temple showed 3. Fixed by refresh-logs.
