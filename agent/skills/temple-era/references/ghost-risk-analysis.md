# Ghost Risk Analysis: Who Signed Up Is Most Likely to No-Show

Workflow for answering: "who of folks signed up for tonight's raid are most likely to ghost us?"

## Data Sources

| Source | What It Tells You | Access Pattern |
|--------|-------------------|----------------|
| **Scheduled Raids** (`/scheduled-raids`) | Upcoming events with id, title, signUpCount, roleCounts | Find tonight's event |
| **Event Signups** (`/scheduled-raids/{eventId}/signups`) | All signups with server-side character matching + inlined attendance | Who signed up + their character IDs |
| **Raid Plan** (`/raid-plans/{id}?include=characters`) | Who was in the plan roster for a past event | "Signed up" truth for a past raid |
| **Character Attendance** (GraphQL `character(id: N) { attendance }`) | Historical attendance records | Check absence patterns |
| **Character Families** (GraphQL `characterFamilies`) | Family-level attendance across all alts | Deeper history per player |

## Process: "Who's Most Likely to Ghost?"

### Step 1 — Find tonight's event and its signups

```
GET /scheduled-rails           → find the event, note its id
GET /scheduled-raids/{eventId}/signups  → all signups
```

### Step 2 — Auto-flag by RSVP status

Raid Helper signups have a `className` / `status` field. Flag these immediately:

| Status | Meaning | Action |
|--------|---------|--------|
| `Absence` | Said they won't be there | Expect them |
| `Tentative` | Unsure | May or may not show |
| `Bench` | Volunteer, not expected | Low priority |
| `Late` | Coming late | Will show but delayed |
| `primary` (confirmed) | Standard signup | Needs attendance check |

### Step 3 — For confirmed signups, check attendance for BWL/MC content from the last ~2 weeks

Query attendance for each matched character's primary ID, focusing on recent BWL and MC raids:

```graphql
query {
  char: character(id: PRIMARY_ID) {
    name
    attendance(from: "2026-04-27") {
      status
      raid { date name zone }
    }
  }
}
```

Key raid dates to check (BWL/MC-specific, as that's tonight's content):
- **Last Friday's BWL/MC** — most recent same-content raid
- **Last Sunday's BWL/MC** — last week's Sunday run
- Both absent from both = higher risk

### Step 4 — Cross-reference: were they signed up for the raids they missed?

**Critical pitfall — absence ≠ ghosting.** Someone may have been absent from a logged raid because they simply weren't signed up for it.

To confirm ghosting: compare a past raid plan roster against attendance records for that same raid.

```
GET /raid-plans/{previousPlanId}?include=characters
```

Then check each signup's attendance on the specific dates matching that plan.

**A signup who was in the plan but ABSENT from the logged raid = proven ghoster.** Flag them as highest risk for tonight.

### Step 5 — Rank by risk tier

| Tier | Criteria | Examples |
|------|----------|---------|
| 🔴 Confirmed ghoster | Was in last week's plan, was absent from the logged raid | Yukain (signed up for BWL/MC 05/03, didn't attend either) |
| 🔴 Chronic absent | Signed as primary, missed both BWL/MC runs in the last week (Fri + Sun) | Peazie, Balthra, Vy, Chokletmilk |
| 🟡 Missed Friday | Signed as primary, missed last Friday's BWL/MC but attended Sunday | Tagerr, Chikalhur |
| 🟡 Unmatched | No character match — can't verify attendance history | Waffle, TheCouncilofYag |
| ✅ Reliable | Attended both recent BWL/MC runs they were signed up for | Most regulars |
| ⬜ Already flagged | Signed as Absence/Bench/Tentative | Already self-reported |

### Step 6 — Present results concisely

Format for Discord (no markdown tables):

```
🔴 Confirmed ghosters from last week (signed up, didn't show):
  • Yukain — Shaman
  • Laeny — Warrior (Ary/Lanyre/Fry)

🔴 Highest risk — signed primary but missed both BWL/MC this week:
  • Peazie — Mage (missed last 8+ raids)
  • Balthra — Shaman Enh (only 1 raid in 3 weeks)

🟡 Missed Friday's BWL/MC but attended last Sunday:
  • Tagerr — Tank, Chikalhur — Tank, ...

Already flagged themselves: Frostbringer, Coarse, Daisý, ...
```

## Pitfalls & Gotchas

- **Attendance ≠ signup.** A player may have been absent from a PUG raid they didn't sign up for. Only flag as ghost if they were in the plan roster for that event.
- **bench counts as attended** for ghost purposes — the system counted them as present even if they didn't raid. Don't flag bench slots as missing.
- **Signup class ≠ attendance class.** Someone signing as Paladin named Waffle may have attended on their Shaman alt Wawful. The `matchStatus` in the signups endpoint handles family resolution for you.
- **Discord alt-pair names.** Names like "Chronic/Vxder", "Gator/Milkers-Ashkandi", "Ary/Lanyre/Fry" mean the player has multiple characters. The signups endpoint resolves these server-side for matched signups.
- **Inlined attendance is per-character, not per-family.** The 6-week attendance in the signups response may only reflect the matched character, not their alts. For a full picture, query `characterFamilies` via GraphQL.
- **Some people sign up for Sunday BWL/MC but only intend to attend one wing.** This is normal — don't flag someone as a ghoster if they attended BWL but skipped MC.
- **New signups with no history** (not in last week's plan, no attendance records) can't be assessed. Note them as "unknown" so the RL can decide.
