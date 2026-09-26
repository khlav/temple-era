# Raid Schedule Audit

Audit logged raids against a weekly schedule template (e.g. "Tue Naxx, Thu AQ40, Fri BWL+MC, Sun BWL+MC").

## Query

Use GraphQL to fetch all raids in the year:

```graphql
query {
  raids(from: "2026-01-01", to: "2026-12-31", limit: 500) {
    id
    date
    name
    zone
  }
}
```

A limit of 500 should cover a full year for a single-guild setup.

## Week Grouping

Raid weeks are **Tuesday to Monday**. To determine day-of-week: Jan 1, 2026 was a Thursday. Day offsets can be computed relative to that.

For each raid in the response, determine its day of week and zone, then group by week.

## Check Template

For each week (Tue-Mon), check:
- Tue: Naxxramas
- Thu: Temple of Ahn'Qiraj
- Fri: Blackwing Lair + Molten Core
- Sun: Blackwing Lair + Molten Core

## Reporting

- Report only actual gaps — a raid that ran on a different day still satisfies the week's requirement.
- Ignore off-schedule raids (ZG, AQ20, Onyxia) and mislabeled zone assignments unless they cause a gap.
- If the user provides an explicit output format, follow it exactly — no preamble, no post-script, no explanation.
- When the user says "ignore X" (e.g. pre-schedule period, a known gap stretch), respect that and exclude those weeks.
- If there are no gaps to report, say just that.
- **Kill data not reliable.** This audit checks raid *existence* per lockout week (date + zone), which is fine. Do NOT extend it to check whether specific bosses were killed — the `kills`/`killCount` fields on logged raids are incomplete imports and cannot be trusted to determine if a boss like KT was actually killed.
