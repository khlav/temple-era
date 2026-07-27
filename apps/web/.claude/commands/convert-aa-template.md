Convert an AngryAssignments (AA) template for use in the raid planner's slot system.

## Input

The user will paste a raw AA template with hardcoded character names. Process it and save to `plans/aa/{zone}/{bossname}.txt`. Determine the zone and boss name from the template content.

$ARGUMENTS

## Template System Reference

Read `src/lib/aa-template.ts` and `src/lib/aa-formatting.ts` to understand the full AA template syntax if needed.

### Slot syntax

- `{assign:SlotName}` — assignable slot (no max-character limits unless explicitly requested)
- Slot names should be PascalCase, concise, and describe the role/duty (e.g., `MT`, `XTank`, `KiteHeals`, `PrimaryMC`)

### Formatting syntax

- Color codes: `|cclassname` (e.g., `|cwarrior`, `|cshaman`, `|cdruid`), `|cred`, `|cffRRGGBB`
- Color reset: `|r` (always use `|r`, never `|cpriest` as a pseudo-reset)
- Icons: `{skull}`, `{x}`, `{moon}`, `{triangle}`, `{diamond}`, `{circle}`, `{square}`, `{star}`, `{cross}`
- Role icons: `{tank}`, `{healer}`, `{dps}`
- Class icons: `{warrior}`, `{paladin}`, `{hunter}`, `{rogue}`, `{priest}`, `{shaman}`, `{mage}`, `{warlock}`, `{druid}`
- Ability icons: `{bloodlust}`, `{heroism}`, `{healthstone}`
- Spell icons: `{icon SPELLID}`

## Conversion Rules

### Goal

Replace hardcoded character names with `{assign:SlotName}` slots while preserving the spirit of the content — roles, organization, phases, and general instructions.

### What to convert to slots

- Specific character assignments (tank on skull, healer on web wraps, etc.)
- Named role duties (dispeller, mind controller, pack runner, etc.)

### What to keep as static text

- General class-wide instructions (e.g., "Shamans Druids Cleanse Poisons")
- Phase-wide directives (e.g., "All tanks pick up adds", "Everyone Dodge Fire")
- Decorative coloring and stylistic flourishes (e.g., multi-colored "ASAP")
- Boss/target labels (e.g., `(|credAnub|r)`)
- Positional callouts and directions

### Formatting conventions

1. **Separators**: Use `::` between different roles on the same line (e.g., tank :: healer). Use commas for same-role lists (e.g., OT positions).
2. **Icon spacing**: Space between icons and text/slots (`{tank} {assign:MT}`), but NO space between adjacent icons (`{dps}{tank}{healer}`).
3. **Section headers**: Labels like `|cwarlockMind Controls|r` go on their own line above their slots.
4. **Slot labels**: Keep on the same line as the slot, not the next line.
5. **Blank lines**: Between logical sections for readability.
6. **Boss title**: `===BOSS NAME===` on line 1.
7. **Phase headers**: `==PHASE N==` when the fight has distinct phases.
8. **Undead tags**: Use `(|cwarlockundead|r)` or `(|credNOT|r |cwarlockUNDEAD|r)` as appropriate.

## Output

1. Save the converted template to `plans/aa/{zone}/{bossname}.txt`
2. Show a summary table of slots created with descriptions
3. Note any key decisions made during conversion

## Reference Examples

### Noth (slot-based)

```
===NOTH===
(|cwarlockundead|r)

==PHASE 1==
{tank} {assign:FirstTank} First Tank
{tank} {assign:SecondTank} Second Tank
{priest} {assign:Dispeller} {icon 527} |cwarlockDispel|r Tank/Offtank

{circle} Directions as looking into the room from the door:
{tank} {assign:OTLeft} (Immediate Left), {assign:OTRight} (Immediate Right), {assign:OTBackRight} (Back Right) OTs
{mage}{druid} |cdruidDe|cmagecurses|r

==PHASE 2==
{tank} All tanks pick up adds
{dps} Stun, focus Plagued Guardians
```

### Faerlina (slot-based with section header)

```
===FAERLINA===
(|credNOT |cwarlockUNDEAD|r)

{skull} (|credFaerlina|r) {assign:MT} :: {assign:MTHeals}
{x} {assign:XTank} {square} {assign:SqTank} :: {assign:Group1Heals}
{moon} {assign:MoonTank} {triangle} {assign:TriTank} :: {assign:Group2Heals}
{diamond} {assign:DiaTank} {circle} {assign:CircTank} :: {assign:Group3Heals}

|cwarlockMind Controls|r
{priest} {assign:PrimaryMC} (primary)
{priest} {assign:BackupMC} (bubble primary, backup)
Worshipper MC Order: {moon} -> {triangle} -> {diamond} -> {circle}

Everyone Dodge |credFire|r
{shaman}{druid} |cshamanShamans |cdruidDruids|r |chunterCleanse Poisons|r |credA|cdruidS|cwarlockA|chunterP
```
