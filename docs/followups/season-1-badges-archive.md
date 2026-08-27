# Season 1 badges — archive

Historical record of the Season 1 badge system, replaced by the permanent Achievement
Engine (`docs/ideation/achievement-engine/contract.md`) in that project's Phase 5. This
file preserves what the badges were and how they were computed; the code itself
(`apps/web/src/lib/badge-definitions.ts`, `apps/web/src/lib/badge-evaluator.ts`,
`apps/web/src/components/characters/character-badges.tsx`) has been deleted. See the
contract's problem statement for why — permanence and officer-manual-grant needs weren't
achievable with this system's design.

## The 14 badges

| ID | Name | Rarity | Description |
| --- | --- | --- | --- |
| `fresh-face` | Fresh Face | Common | New to raiding! Only attended raids in the last 1-2 weeks. |
| `bench-warmer` | Bench Warmer | Common | Earned full week attendance credit through bench support in at least one week. |
| `shapeshifter` | Shapeshifter | Common | Flexed between multiple characters during raids in the same week. |
| `dungeon-crawler` | Dungeon Crawler | Uncommon | Explored all 4 main raid zones in the last 6 weeks (Naxx, AQ40, BWL, MC). |
| `tight-squad` | Tight Squad | Uncommon | Joined 3+ different 20-man raids in the last 6 weeks (Onyxia, AQ20, ZG). |
| `big-and-small` | Big and Small | Uncommon | Participated in both 40-man and 20-man raids during the same week. |
| `fire-walker` | Fire Walker | Rare | Braved the flames of Molten Core for 4+ consecutive weeks. |
| `dragon-slayer` | Dragon Slayer | Rare | Slayed dragons in Blackwing Lair for 4+ consecutive weeks. |
| `bug-whisperer` | Bug Whisperer | Rare | Mastered the Temple of Ahn'Qiraj for 4+ consecutive weeks. |
| `necromancer` | Necromancer | Rare | Conquered the terrors of Naxxramas for 4+ consecutive weeks. |
| `iron-will` | Iron Will | Epic | Showed unwavering commitment by attending at least 1 zone every week for 6 consecutive weeks. |
| `dedicated` | Dedicated | Epic | Demonstrated dedication by attending 2+ 40-man raids in 4+ consecutive weeks. |
| `completionist` | Completionist | Epic | Completed all 7 raid instances in a single week (Naxx, AQ40, BWL, MC, Onyxia, AQ20, ZG). |
| `perfect-attendance` | Perfect Attendance | Legendary | Achieved perfect attendance with 18/18 credits over the last 6 weeks. |

Rarity followed WoW item-quality color conventions (gray → green → blue → purple →
orange), rendered as `BADGE_CATEGORIES` badge-color classes in the old UI.

## How evaluation worked

`evaluateAllBadges` computed every badge's earned/unearned state **live, client-side, on
each page view** — nothing was persisted. It took a `BadgeEvaluationContext` (the same
weekly attendance data already fetched for the attendance heatmap: a rolling window of
weeks, each flagged `isHistorical` or not, with per-zone attended/bench/weight detail) and
filtered to the 6 non-historical "scoring weeks." Each badge had its own boolean predicate
over those weeks — consecutive-week streak counting (`findLongestConsecutive`) for the
zone-specific Rare badges and Iron Will/Dedicated, set-membership checks
(`hasAttendedZones`, `count20ManRaidsAttended`) for the breadth-based Uncommon badges,
single-week structural checks (`hasBothSizesInSameWeek`, `hasAllInstancesInSameWeek`,
`hasFullBenchWeek`, `hasMultipleCharactersInSameWeek`) for Big and Small, Completionist,
Bench Warmer, and Shapeshifter, an early/late-week attendance split (`isFreshFace`) for
Fresh Face, and a direct threshold check (`weightedAttendance >= 18`, no helper function)
for Perfect Attendance. Because nothing was stored, a badge's earned state could change
from one page view to the next as the rolling
6-week window moved, and there was no way to grant one manually or make it permanent.
