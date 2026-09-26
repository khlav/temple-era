# Talent Scouting — New/Upcoming Raider Identification

Find players of a specific class/spec who are newly active (attending regularly but haven't been raiding for 9+ months).

## Workflow

### Step 1 — Pull all guild characters (watch the 200 limit)

```
GET /characters?limit=200
```

Returns up to 200 characters alphabetically — **this is not guaranteed to cover the full roster**. Larger guilds have characters past the 200th entry that will be silently omitted. Characters with names starting later in the alphabet (S, T, W, etc.) are especially at risk of being missed — they simply won't appear in the response at all.

To find characters past the first 200, run multiple targeted `?q=` substring searches:

```
GET /characters?limit=200&q=sh     # finds names containing "sh" — Shamkira, etc.
GET /characters?limit=200&q=ti     # finds names containing "ti" — Tigorrtotems, etc.
GET /characters?limit=200&q=ma     # finds names containing "ma"
GET /characters?limit=200&q=mi     # etc.
```

**Important:** `?q=` does a case-insensitive substring match on **character names only**, not class names. `?q=shaman` returns characters named "ShamanX", not all shaman-class characters. Use multiple bigram/trigram searches to get broad coverage across the alphabet.

**Unspec-spec characters:** Some characters have `classDetail: "Shaman"` or `"Druid"` without a spec suffix (no "-Restoration", "-Elemental", etc.). These could still be resto — the spec may not be tracked. Note this uncertainty in your response.

### Step 2 — Check recent attendance (REST)

```
GET /characters/{id}/attendance
```

Returns an 18-week rolling window with `raids[]` containing `attendeeOrBench` (`"attendee"` / `"bench"` / `null`). Also shows `attendancePct` and `weeksTracked`.

**⚠️ `weeksTracked` is always 18.** This field does NOT indicate how long someone has been in the guild. A raider since 2024 and a brand-new June 2026 recruit both show `weeksTracked: 18`. Never use this to determine tenure.

Count `attendeeOrBench: "attendee"` entries for recent activity. The threshold is flexible — for "new and upcoming" expect 6+ attendee entries in the ~6-week window.

### Step 3 — Determine if they're NEW (no raiding 9+ months ago)

This is the critical step that determines if someone is truly new or just returned after a break.

**Don't rely on the REST endpoint for this** — it only covers the last 18 weeks.

Use GraphQL with **`{ status }` only** (no `raid { date }`) to check for any attendance before your cutoff date. Include only status to minimise payload size — the `raid { date }` field makes responses massive.

**Batch multiple candidates in a single query using aliases** (10 at a time is fine):

```graphql
query {
  broke: characterFamilies(primaryCharacterIds: [60452486]) {
    primary { id name }
    early: attendance(from: "2024-06-01", to: "2025-10-01") { status }
  }
  nudnud: characterFamilies(primaryCharacterIds: [73547126]) {
    primary { id name }
    early: attendance(from: "2024-06-01", to: "2025-10-01") { status }
  }
}
```

Scan the response for any `ATTENDED` or `BENCH`. If all entries are `ABSENT`, the character is genuinely new. If even one `ATTENDED` or `BENCH` appears, they're an established raider — exclude them.

The single-year range (`2024-06-01` to `2025-10-01`) with `{ status }` only is compact enough (~2-3k chars per candidate) to avoid truncation for most characters. Even so, 8+ candidates per query can push the limit — keep batches to 5-8 for safety.

**Quicker alternative — check first half of this year.** Query `from: "2026-01-01" to: "2026-05-31"` with `{ status }`. If a character has ATTENDED entries throughout Jan-May, they've been raiding at least 7 months — likely not "new". If they were all ABSENT with ATTENDED only appearing after June, they're freshly recruited. This range is much smaller and won't truncate.

**⚠️ GraphQL TRUNCATION TRAP — MAJOR FALSE POSITIVE SOURCE.** If the date range is too wide (e.g. `from: "2024-06-01"` to `to: "2025-10-21"`), or you include `raid { date }`, the response can exceed 400k+ characters and truncate silently. The visible portion is typically all `ABSENT` entries from July 2024, lulling you into thinking the character is new — but `ATTENDED` records may exist in the truncated tail (December 2024 or later).

**Concrete failure:** Querying Daisý's attendance from `"2024-06-01"` to `"2025-10-21"` with `{ status raid { date } }` returned 112k chars. The visible entries (July 2024) were all `ABSENT`. But ATTENDED records existed at December 6, 2024 — invisible because the output truncated. Same failure with Micoshock (raiding since July 2024).

**Mitigation strategy:**
1. **Always use `{ status }` only** for wide-range tenure checks. Drop `raid { date }` entirely unless you need specific dates.
2. **Keep ranges ≤ 12 months.** A 12-month span with `{ status }` only is safe. Wider ranges risk truncation.
3. **Batch 5-8 characters per query** to stay under the tool response limit. More than 10 risks silent truncation.
4. **If response is truncated** (check the `[Truncated]` notice), split into smaller date chunks (e.g. `from: "2024-06-01"` to `"2025-01-01"`, then `from: "2025-01-01"` to `"2025-10-01"`).
5. **Cross-check with REST.** If REST `/characters/{id}/attendance` shows a first raid date suspiciously close to the start of its 18-week window, that's a sign the player may have older history. Check GraphQL carefully.
6. If the user corrects a false positive, re-verify the specific character using chunks before accepting any result.

### Step 4 — Handle alt relationships

If a resto shaman/druid is `isPrimary: false`, check their `primaryCharacter`. The primary character may be an established raider. In that case, the resto alt belongs to an existing player and doesn't count as "new talent" for the guild.

### Step 5 — Filter out inactives

Characters with `attendancePct: 0` and `weeksTracked: 0` have no tracked raids despite having a roster entry. They're not active raiders — skip them.

### Alternate approach — "Youngest N" by first raid date

Instead of filtering by raid count, find the N newest raiders of a given class(es) by scanning every guild character of that class, computing their earliest ATTENDED raid date, and sorting ascending.

This avoids raid-count thresholds and finds genuinely raw recruits with only 1-2 raids. Steps:

1. **Enumerate all characters.** Use alphabet-based `?q=` enumeration (see Pitfalls — Alphabet enumeration) to discover every guild member, or use GraphQL `characters(search: "", limit: 500)` to get a fuller picture. Class-filter client-side by `classDetail`.

2. **For each candidate, find their earliest raid.** Query GraphQL `characterFamilies.attendance` starting from the current date and working backwards, or use a targeted early range. The goal is the date of the first ATTENDED/BENCH entry.

3. **For candidates with zero tracked raids**, note them separately — they exist in the roster but have never been in a logged raid. They may be bank characters, inactive, or leveling.

4. **Sort ascending** by first raid date (most recently started = newest). Present the top N.

5. **Watch for false positives** from the truncation trap (see above). If any result looks suspicious (named character raiding 9+ months ago that the user flags), re-verify with chunked queries.

6. **Report total found.** If the user asks for 10 and only 8 exist, say so plainly. Offer to include zero-tracked candidates as "never raided" if appropriate.

**Real example (Temple guild, July 2026):** Scanning all shaman+druid characters for their first raid found only 8 characters with any tracked raids. An additional ~15 characters existed in the roster but had zero tracked raids — never attended a logged event.

Output format (user preference: no links, just names and facts):

```
Name — Spec (Server) — first raid DATE — PCT% — # recent
```

## Pitfalls

- **GraphQL attendance truncation.** Querying `characterFamilies.attendance` over a wide date range (e.g. 2024-2026) can return 400k+ chars and truncate. Narrow your query to just the check period needed and use REST for the recent window.
- **No spec filter on the API.** You must pull all characters and scan `classDetail` manually — no `?spec=Restoration` param exists.
- **"Shaman" / "Druid" without spec.** Characters with `classDetail: "Shaman"` without "-Restoration" may still be resto. Note this ambiguity.
- **`isIgnored` = 0% attendance.** Check `GET /characters/{id}` for `isIgnored: true` before concluding zero attendance means inactivity.
- **Absent from early raids ≠ not raiding.** Every character has `ABSENT` entries for every raid that existed. Only `ATTENDED`/`BENCH` entries indicate actual participation.
- **Players raid on alts.** A resto shaman alt (e.g. Amai, alt of Shtank) belongs to an established player. Check `primaryCharacter`.
- **200-entry ceiling hides late-alphabet names.** Characters named S-Z are most at risk of being silently omitted. Use `?q=` searches for coverage.
