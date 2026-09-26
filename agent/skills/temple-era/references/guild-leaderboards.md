# Guild-wide Ranking — "Most Raids" Leaderboards (character-tab-accurate)

Trigger: "who has run the most raids with Temple", "top N by attendance", "most active family", any guild-wide attendance ranking. There is no leaderboard/orderBy query in the GraphQL schema — rank client-side.

## ⚠️ MANDATORY — read this file BEFORE writing any ranking query (2026-08-08 incident, corrected 2026-08-08)

A "top 5 families" answer was shipped from a freehanded query `character(id: X) { attendedCount(includeFamily: true) }` — broken two ways (not three; see correction below). Never reconstruct ranking queries from memory. Copy the shapes in this file verbatim:

1. **Never omit `from`** — without `from: "2000-01-01"` the count is windowed (Ramson showed 50 instead of true 127).
2. **Never auto-pick `zones:`.** Ask the user first: 40-man raids only (MC/BWL/AQ40/Naxx — what the character tab shows), or include 20-man/other raids too (AQ20, ZG, Onyxia)? Don't default silently to one or the other — the answer changes the ranking. Once they answer, use the matching zone list for the whole conversation unless they change their mind.
3. **Use `includeFamily: true` for a "character+alts" question — this is correct, not a bug.** It dedupes a raid where two of the same person's characters both attended (counts once). An earlier version of this doc said to manually sum primary + secondaries instead — that's wrong, it double-counts those shared raids. Always use `includeFamily: true` for family/person-level totals; only omit it when the question is about one specific character in isolation.
4. **Label results provisional/upper-bound** unless tab- or log-verified — `attendedCount` is roster-based and overcounts long-tenured veterans vs the log-based tab.
5. **Sanity-check against at least one user-confirmable number before shipping a ranked list**; if your number disagrees with a number the user states, say so and ask — never quietly re-guess.

## The metric that matches the character tab (verified Aug 2026)

The site's character tab shows, per character, per zone: `N attended (+M bench)`. For a single character's own tab number, use this GraphQL call, exactly:

```graphql
character(id: X) {
  attendedCount(from: "2000-01-01", zones: [MOLTEN_CORE, BLACKWING_LAIR, TEMPLE_OF_AHN_QIRAJ, NAXXRAMAS])
}
```

Properties (all required for exact match to one character's own tab number):
- `from: "2000-01-01"` — without it the count is **windowed** (Ramson showed 50 instead of 127).
- `zones:` — the character tab itself only shows the 4 40-man zones (ZG/AQ20/Onyxia excluded), so use `[MOLTEN_CORE, BLACKWING_LAIR, TEMPLE_OF_AHN_QIRAJ, NAXXRAMAS]` if matching the tab is the goal. For a general "most raids" ranking question, ask the user which zone set they want (see MANDATORY section above) rather than assuming tab-parity is what they're after.
- `includeBench` defaults `true` — bench shows as "+N bench" on the tab and IS part of the tab total.
- `includeFamily` **false/default** for this single-character number.

For a **family/person total** ("character+alts", "most raids run by X"), add `includeFamily: true` to the same call instead of summing primary + secondaries by hand — summing double-counts any raid where two of that person's characters both attended.

Verified exact against the tab: Ramson 127, Zulatana 37/26/26/37, Abacha 35/52/27/10, Gallommius 10/9/5, Dragaia 4/2/1 (all bench), plus Ramson family alts 30/3/9/1.

⚠️ **`attendedCount` is NOT tab-accurate for long-tenured characters.** Aug 2026 audit found the API overcounting vs the tab: Rogand 505→246, Beeseajay 452→218, bcjlock 46→35. The tab counts **WCL log appearances**; `attendedCount` counts roster attendance records, which can mark a char ATTENDED/BENCH on raids where they are not in the log. Short-tenure chars and most alts match 1:1, so a clean verification on one family proves nothing about the veterans. **Every family in a ranking needs its own verification** (tab readout or log scan) before you trust the number.

## Recipe (~1,094 primaries, Aug 2026)

### Step 1 — enumerate primaries, ids ONLY

```graphql
query { characters(type: PRIMARY) { id } }
```

⚠️ Do NOT include `name class` here: `characters(type: PRIMARY) { id name class }` returned a 103k+ char response that truncated mid-list (tool cap ~100k), silently losing characters. Bare `{ id }` came back ~13k chars, complete.

### Step 2 — batch primary characters with family-deduped counts

```graphql
query {
  c1: character(id: 11265555) { name c: attendedCount(from: "2000-01-01", zones: [MOLTEN_CORE, BLACKWING_LAIR, TEMPLE_OF_AHN_QIRAJ, NAXXRAMAS], includeFamily: true) }
  c2: character(id: 33802788) { name c: attendedCount(from: "2000-01-01", zones: [MOLTEN_CORE, BLACKWING_LAIR, TEMPLE_OF_AHN_QIRAJ, NAXXRAMAS], includeFamily: true) }
  ...
}
```

- Query on the **primary character's id** with `includeFamily: true` — this returns the whole family's deduped total directly, no manual summing and no separate `characterFamilies` lookup needed for the count itself.
- If you also need the alt names/roster for display, fetch `characterFamilies(primaryCharacterIds: [...]) { primary { name } secondaries { name } }` separately — but use it for names only, not for summing counts.
- **~100-200 characters per query is safe** depending on aliasing; watch the ~100k char response cap.
- Keep a running top-10 as you go. Most primaries return 0 — the top separates quickly, but every ID must be checked to find the top 5.

### Step 3 — verify before presenting

If the user can see the character tab, spot-check your metric against 1-2 families they name before scaling up. A rejected ranking costs more than a verification query. Ask for (or recall) their tab numbers and confirm equality first.

## ⚠️ Log-vs-roster overcount anomaly — Rogand, Beeseajay, bcjlock (and probably other veterans)

API `attendedCount` overcounts vs the character tab for long-tenured characters. Confirmed cases (all-time, 4 40-man zones): Rogand 505 vs tab 246, Beeseajay 452 vs tab 218, bcjlock 46 vs tab 35. Character-specific, NOT family-wide — same-family alts (Zulatana, Abacha, Gallommius, Dragaia, and 6 of Beeseajay's 7 alts) matched 1:1.

Diagnosed:
- Bench matched exactly (Rogand 28) — bench is roster-side.
- Attended was inflated 1.4–5x (worse the longer the zone has run).
- Root cause: char is marked ATTENDED/BENCH on the roster for raids where they are **not in the WCL log attendees**. Confirmed on raid 843 (MC 08/02): Beeseajay BENCH + Rogand ATTENDED in roster, but absent from the log's 40 attendees.
- So the tab's attended column is log-based for affected veterans; `attendedCount` counts roster records. Take the user's tab figure for any family that disputes a number.

## Reproducing the tab exactly — full log scan (the only exact method)

Tab total per character = number of distinct raids where the char appears in ANY of that raid's `logs.attendees` (count a raid once per char even across multiple logs). To compute for all characters you must scan every raid:

```graphql
query { raids(limit: 20, offset: N) { id logs { attendees { character { id } } } } }
```

- ~815-848 raids total (Aug 2026: `raids(limit: 1000) { id }` returns the complete list, newest first, ends at id 163).
- Full attendee sweep ≈ 4k chars per raid → **≤ 20-25 raids per query** to stay under the ~100k cap. ~35+ queries for the full history — too heavy for the main thread.
- **Delegation pitfalls (learned the hard way):** sub-agents given this scan silently substituted `characterStatus`/`attendedCount` (the forbidden metric) and produced garbage. When delegating, (1) state that ONLY `logs.attendees` may be read, (2) name the forbidden fields explicitly, (3) check what the delegate actually ran for query shape before trusting counts. Long parallel scans also get interrupted ("child did not finish in time") — keep each worker to ≤ 8 chunks.

## Pitfall — character ID ↔ name transposition

When assembling per-character ID lists (e.g. from `characterFamilies` secondaries), do NOT assume response order maps to names you expect. An earlier pass transposed four Beeseajay alts (Bcjhunt/Bcjstab/Bcjlock/Bcjmoo), which corrupted per-character verification claims. Always confirm name↔id pairing with `characters(search: "Name") { id name }` before presenting per-character numbers. Family SUMS are transposition-safe; per-character claims are not.

## Response-size pitfalls observed

- GraphQL tool response cap ≈ 100k chars (115k and 167k responses both truncated).
- `raids(limit: 30)` with `logs { attendees }` ≈ 169k chars — truncated. Keep log-attendee sweeps ≤ ~12-15 raids per query, or request ids only.
- REST `GET /raids?scored=true&limit=1000` still returns only the newest 100 (hard cap).
- REST `GET /characters?type=primary&limit=N` ignores limit, caps ~200 alphabetically — use GraphQL `characters(type: PRIMARY) { id }` instead.
- **One-shot "all families at once" 504s.** `characters(type: PRIMARY) { id name c: attendedCount(from: "2000-01-01", zones: [...], includeFamily: true) }` — the tempting single-query shape — dies with HTTP 504 FUNCTION_INVOCATION_TIMEOUT (confirmed 2026-08-08). ~1,000 family-count computations in one request exceed the server's execution budget. Never attempt it; go straight to the batched-alias sweep (~100-150 ids/query).
- **Delegated sweep can stall too.** A full-guild batched sweep delegated to a subagent interrupted after 2 calls / ~2 min ("waiting for model response"), returning nothing. The sweep is mechanical (7-10 identical batched queries) — run it directly on the main thread rather than delegating; delegation only adds stall risk for this specific task. The ≤8-chunks guidance still governs log scans.
- **User expectation — offer the tradeoff before grinding.** When a raid lead asks for a full-guild ranking, state up front: one query can't do it (504), it's ~7-10 batched queries, and results are provisional until tab-verified. Surface that cost and offer the provisional table in this file before burning the sweep — Dunckan bailed entirely ("nah fuck this I have a better idea") once he learned a single query can't return it.

## Provisional top families (sweep ~700/1,094 families, Aug 2026 — ⚠️ UNVERIFIED against tab, and computed via manual primary+secondaries summing — now known to double-count any raid where two of a person's characters both attended, so these numbers may run slightly high for families with such overlap; re-derive with `includeFamily: true` before trusting)

| Rank | Family | Count (sum, incl. bench) |
|---|---|---|
| 1 | Yagnar + 3 alts | 690 |
| 2 | Minti + 4 alts | 689 |
| 3 | Whopperjr + 4 alts | 599 |
| 4 | Abishai + 5 alts | 587 |
| 5 | Kugean + 4 alts | 553 |
| 6 | Âcomp + 6 alts | 524 |
| 7 | Ramdoch + 3 alts | 510 |
| 8 | Rescommunis + 3 alts | 502 |
| 9 | Skinchanger + 3 alts | 477 |
| 10 | Beeseajay + 7 alts | 468 |

These are `attendedCount` sums — every veteran family carries the overcount risk, so treat as upper bounds, not final. Tab-verified so far: Rogand family 528 (API 787), Beeseajay family 468 (API 702; earlier "6 of 8 alts matched" claim was unreliable due to the ID transposition). Zulazeelu 443, Maynark 426, Jeianstew 404 nearby. Do not present ranks as final without tab or log-scan verification.

## Presenting an unverifiable ranking — user expectation (Aug 2026)

A raid lead pushed back hard on "you read the tab totals for 10 families, I sort them": that puts ~99% of the work on the user for a trivial sort. The tab is O(1) per character for the SITE; it is NOT cheap for the user to hand-sum a dozen families. Acceptable paths when `attendedCount` is suspect: (1) run the full log scan via delegated workers yourself, (2) present clearly-labeled provisional numbers and offer to verify specific families, or (3) ask the user to read ONE family at a time only if they offer. Never hand the user a homework list as your "solution". If they say stop, stop — don't keep grinding.
