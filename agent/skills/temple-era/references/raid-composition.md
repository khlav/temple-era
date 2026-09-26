# Raid Composition & Group Building Guide

Classic WoW 40-person raid group builder for BWL and MC. Use this when arranging a roster from signups.

## Class Distribution Principles

### Tanks (5-7 from ~12 warriors)
- **Main Tank (MT)** — Most geared/experienced warrior, usually the same person each week
- **Off Tank (OT)** — Secondary tank, picks up adds, taunts on tank swaps
- **Flex OTs** — 2-3 additional warriors for fights needing multiple tanks (Broodlord: 3 tanks + whelp tank; Drakonid trash: 3 pairs)
- **Druid OTs** — Druids (especially feral) can flex as buffet tanks, whelp tanks, or third OTs. Good for Firemaw/Ebonroc/Flamegor wing buffet duty (Barkskin helps)
- **Remaining warriors** — Fury DPS with occasional taunt duty

### Healers (13-16 from Shamans + Priests + Druids)
- **Shamans** — Windfury totem in melee groups (critical), chain heal, spot heals
- **Priests** — Best single-target MT healers, also cleanse/dispel duty
- **Druids** — HoTs, combat rez, Innervate, flex as OTs if feral

Target: 5-6 Shamans, 5-6 Priests, 2-3 Druids ideally.

### Melee DPS
- Rogues, Fury warriors, Enhance shamans, Ret paladins (if any)
- Want Windfury totem in every melee group (1 Shaman per melee group)
- Rogues: kick/interrupt duty on technician trash, suppressor room traps

### Ranged DPS
- Mages, Warlocks, Hunters, Balance druids, Shadow priests
- Mages: decurse, sheep MC'd on Nefarian
- Warlocks: curses (Recklessness, Elements, Shadow), health stones
- Hunters: tranq shot rotation (Flamegor, Chromag), pull duty

**Note on indexing:** When presenting groups to the guild, always convert API 0-based to 1-based. Group 0 in the API = Group 1 in messages.

## Group Building Strategy

### MT Group (Group 0 / "Group 1" in messages)
- MT + OT + heavy heals + Shaman (Windfury) + flex
- **Purpose:** Keep MT alive through boss fights. Windfury helps tank threat.
- **Example:** MT (Warrior) · OT (Warrior) · Priest · Shaman · Druid

### Melee Groups (Groups 1-3 / Groups 2-4 in messages)
Each needs **exactly 1 Shaman** for Windfury totem.
- Avg 3-4 melee DPS + 1 Shaman + 1 spot healer (optional)
- More melee = more groups needed, fewer = condense
- **Typical:** 2-3 Warriors/Rogues + 1 Shaman (WF) + 1 Priest/Shaman

### Caster Group (Group 4 / Group 5 in messages)
- Put all Warlocks + Mages + 1 Shaman (Mana Spring totem)
- No spell-damage totem in Classic Era — Wrath of Air is TBC+. Casters group mostly for buff efficiency and curse management (Warlocks: CoE, CoR, CoS).
- **Typical:** 3 Warlocks + 1 Mage + 1 Shaman

### Ranged/Hunter Groups (Groups 5-6 / Groups 6-7 in messages)
- Hunters provide Trueshot Aura
- Mix with extra mages, spot healers
- **Typical:** 2-3 Hunters + Mage(s) + Priest or Shaman

### Healer Flex Group (Group 7 / Group 8 in messages)
- Overflow healers, extra Druids, extra Shaman
- Fills gaps on fights needing more heals

### Bench
- Overflow (~4 people for 44 signups → 40 raid)
- Usually: last-minute signups, late arrivals, people with less attendance

## BWL-specific Considerations

| Encounter | Tank Notes | Special Roles |
|-----------|-----------|---------------|
| Razorgore | 1 MT + 1 OT (P2) | Orb controller (hunter preferred) |
| Vael | 1 MT (others die to BA) | 3 Shamans chain heal rotation |
| Suppressor Trash | 4 marked tanks (Skull/X/Square/Moon) + pickup tank | 3 rogues traps, 2 druids sleep |
| Broodlord | 3 tanks + whelp tank | 1 rogue suppressor duty |
| Technician Trash | Mage kites, 5 tanks | 2 kickers, hunters mark targets |
| Firemaw | 1 MT + 2 buffet tanks | 2 shamans/3 priests/2 druids behind wall |
| Drakonid Trash | 3 pairs (MT+OT each) | 3 healers per pair |
| Ebonroc | 1 MT + 1 OT + 2 buffet | Heal tanks ONLY |
| Flamegor | 1 MT + 2 buffet | 3-hunter tranq rotation |
| Chromag | 1 MT + 1 time lapse tank | 1 druid/1 priest/1 shaman behind wall, 3-hunter tranq |
| Nefarian | 1 MT | 2 challenging shouts (P3), decurse/cleanse, mage sheep MC'd |

## AA Slot Assignment Heuristics

When the API clone loses AA assignments (which it does — encounter templates survive but slot assignments don't), rebuild them following these rules:

1. **MT is always Dactyl** (or whoever the established MT is) for most fights
2. **Tagerr as alternate MT** on Vael (survives BA, Dactyl picks up after)
3. **Best geared resto Druid** goes to buffet tanks (Firemaw/Ebonroc/Flamegor)
4. **Hunters 1-3** filled from most reliable hunters for tranq rotation
5. **Orb duty** on Razorgore = hunter (free to kite, no DPS loss)
6. **Challenging shouts** on Nef = non-MT warriors (can spare GCDs)
