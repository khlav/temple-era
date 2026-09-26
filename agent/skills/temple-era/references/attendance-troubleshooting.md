# Attendance Troubleshooting — Debugging 0% or Unexpected Attendance

## Step 1 — Check the REST attendance endpoint

```
GET /characters/{id}/attendance
```

Three key fields in the response:
- `attendancePct` — computed percentage (0 if ignored or no data)
- `weeksTracked` — number of weeks in the 6-week rolling window (0 if ignored)
- `isIgnored` — (added in PR #253/254) true/false

If `attendancePct: 0` but `raids[]` is populated with entries, the character is likely **ignored**.

## Step 2 — Check the character's isIgnored flag

```
GET /characters/{id}
```

Look for `isIgnored: true`. If set, the attendance aggregation skips this character entirely. The `raids[]` list in the attendance endpoint still shows historical log data, but the weekly percentage calculation won't run.

**To fix:** Un-ignore the character via the temple-era.com character page (no API endpoint available).

## Step 3 — Compare REST vs GraphQL

Use the GraphQL `character` query to get per-character attendance with explicit ATTENDED/ABSENT status:

```graphql
query {
  character(id: <id>) {
    name
    attendance(from: "2026-04-01", to: "2026-05-12") {
      status  # ATTENDED | ABSENT
      raid { id name date zone }
    }
  }
}
```

This gives a definitive per-raid status and is not affected by the ignored flag — it shows raw raid log data.

## Step 4 — Family view for alt activity

If the character shows ABSENT on recent raids but the player claims they were raiding, check their alts:

```graphql
query {
  characterFamilies(primaryCharacterIds: [<id>]) {
    primary { name }
    secondaries { name }
    attendance(from: "2026-04-01") {
      status
      raid { id name date zone }
    }
  }
}
```

The family attendance marks ATTENDED if ANY alt in the family was at that raid.

## Step 5 — Cross-reference with the REST raids list

The REST endpoint returns a `raids[]` array with `attendeeOrBench` values:
- `"attendee"` — explicitly marked as attended
- `null` — found in raid log without explicit mark

Compare against GraphQL — raids with `attendeeOrBench: null` in REST often correspond to `ABSENT` in GraphQL.
