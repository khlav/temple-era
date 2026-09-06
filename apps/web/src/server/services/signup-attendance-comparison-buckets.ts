import { resolveClassName, type SignupMatchResult } from "~/server/api/helpers/match-signups";

/**
 * TEMPLE-98 Signups <-> Attendees tab, pure bucketing logic — no DB, no React, so
 * unit-testable the same way signup-timeline.ts is. Kept in its own file (rather than
 * alongside the DB-fetching wrapper in signup-attendance-comparison.ts) specifically so it
 * stays free of the `~/env` import that wrapper needs — importing `~/env` at module scope
 * throws under a plain `vitest run` with no secrets loaded, so a test of this pure logic
 * would otherwise need to `vi.mock("~/env")` for no reason related to what it's testing.
 */

export interface ComparisonMember {
  characterId: number | null;
  name: string;
  characterClass: string | null;
}

export interface ComparisonCell {
  count: number;
  members: ComparisonMember[];
}

export interface ComparisonTotals {
  signedUpAtZeroHour: number;
  attendedCount: number;
  benchedCount: number;
  exceptionsCount: number;
  unmatchedCount: number;
  allCount: number;
  signedUp: {
    total: number;
    attended: ComparisonCell;
    benched: ComparisonCell;
    noShow: ComparisonCell;
  };
  notSignedUp: {
    total: number;
    attended: ComparisonCell;
    benched: ComparisonCell;
  };
  unmatched: ComparisonMember[];
}

export interface FamilyKeyed {
  characterId: number;
  name: string;
  class: string;
  primaryCharacterId: number | null;
}

function effectiveFamilyId(c: Pick<FamilyKeyed, "characterId" | "primaryCharacterId">): number {
  return c.primaryCharacterId ?? c.characterId;
}

function sortByName(a: ComparisonMember, b: ComparisonMember): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Bucketing happens at the family level (alts resolve to their primary character),
 * consistent with the rest of the attendance system — someone who signed up on their
 * priest but logged in on their mage shouldn't read as both a no-show AND an unsigned
 * attendee. Display identity differs by row: a "signed up" row shows the character/class
 * the person signed up as (matchedCharacter, resolved via matchSignupsToCharacters — the
 * same class-aware family matching the signups API uses); a "not signed up" row shows
 * whichever character actually attended/was benched, since there's no signed-up
 * character to reference.
 */
export function buildSignupAttendanceComparison(
  matches: SignupMatchResult[],
  attendeeRows: FamilyKeyed[],
  benchRows: FamilyKeyed[],
): ComparisonTotals {
  const attendedByFamily = new Map<number, ComparisonMember>();
  for (const c of attendeeRows) {
    const familyId = effectiveFamilyId(c);
    if (!attendedByFamily.has(familyId)) {
      attendedByFamily.set(familyId, {
        characterId: c.characterId,
        name: c.name,
        characterClass: c.class,
      });
    }
  }

  const benchedByFamily = new Map<number, ComparisonMember>();
  for (const c of benchRows) {
    const familyId = effectiveFamilyId(c);
    if (!benchedByFamily.has(familyId)) {
      benchedByFamily.set(familyId, {
        characterId: c.characterId,
        name: c.name,
        characterClass: c.class,
      });
    }
  }

  const signedUpAttended: ComparisonMember[] = [];
  const signedUpBenched: ComparisonMember[] = [];
  const signedUpNoShow: ComparisonMember[] = [];
  const unmatched: ComparisonMember[] = [];
  const signedUpFamilyIds = new Set<number>();

  for (const m of matches) {
    // matchSignupsToCharacters can identify a *family* (via name/Discord-link matching)
    // without being able to pin down which specific alt signed up — e.g. status
    // "unmatched" when the signup's class doesn't match anyone in the family, or
    // "ambiguous" when two alts share that class. Either way `matchedPrimaryCharacterId`
    // is still set. Treating that as fully unresolved would both wrongly list the person
    // under "Unmatched signups" AND (since their family never gets marked as signed up)
    // list their actual attended/benched character again under "not signed up" — the same
    // person counted twice under two different names. Only a signup with no family
    // identified at all belongs in the unmatched strip.
    const familyId = m.matchedCharacter
      ? effectiveFamilyId({
          characterId: m.matchedCharacter.characterId,
          primaryCharacterId: m.matchedCharacter.primaryCharacterId,
        })
      : (m.matchedPrimaryCharacterId ?? null);

    if (familyId === null) {
      unmatched.push({
        characterId: null,
        name: m.discordName,
        characterClass: resolveClassName(m.className, m.specName) ?? null,
      });
      continue;
    }

    // A family signed up twice (e.g. an ambiguous class match resolved to the same
    // family under two different signups) keeps only the first — the matrix bucket
    // is a per-family membership check, not a per-signup one.
    if (signedUpFamilyIds.has(familyId)) continue;
    signedUpFamilyIds.add(familyId);

    const member: ComparisonMember = m.matchedCharacter
      ? {
          characterId: m.matchedCharacter.characterId,
          name: m.matchedCharacter.characterName,
          characterClass: m.matchedCharacter.characterClass,
        }
      : {
          // Family known, specific alt ambiguous/unresolved — display the family's
          // primary character rather than guessing which alt they meant.
          characterId: familyId,
          name: m.matchedPrimaryCharacterName ?? m.discordName,
          characterClass: null,
        };
    if (attendedByFamily.has(familyId)) signedUpAttended.push(member);
    else if (benchedByFamily.has(familyId)) signedUpBenched.push(member);
    else signedUpNoShow.push(member);
  }

  const notSignedUpAttended: ComparisonMember[] = [];
  for (const [familyId, member] of attendedByFamily) {
    if (!signedUpFamilyIds.has(familyId)) notSignedUpAttended.push(member);
  }

  const notSignedUpBenched: ComparisonMember[] = [];
  for (const [familyId, member] of benchedByFamily) {
    if (!signedUpFamilyIds.has(familyId) && !attendedByFamily.has(familyId)) {
      notSignedUpBenched.push(member);
    }
  }

  for (const list of [
    signedUpAttended,
    signedUpBenched,
    signedUpNoShow,
    notSignedUpAttended,
    notSignedUpBenched,
    unmatched,
  ]) {
    list.sort(sortByName);
  }

  const signedUpTotal = signedUpAttended.length + signedUpBenched.length + signedUpNoShow.length;
  const notSignedUpTotal = notSignedUpAttended.length + notSignedUpBenched.length;
  const exceptionsCount =
    signedUpNoShow.length + notSignedUpAttended.length + notSignedUpBenched.length;

  return {
    signedUpAtZeroHour: signedUpTotal + unmatched.length,
    // Raw distinct-character counts (not family-collapsed) — matches the same source the
    // Attendance tab's own header stats read from, so the two tabs never disagree.
    attendedCount: attendeeRows.length,
    benchedCount: benchRows.length,
    exceptionsCount,
    unmatchedCount: unmatched.length,
    allCount: signedUpTotal + notSignedUpTotal,
    signedUp: {
      total: signedUpTotal,
      attended: { count: signedUpAttended.length, members: signedUpAttended },
      benched: { count: signedUpBenched.length, members: signedUpBenched },
      noShow: { count: signedUpNoShow.length, members: signedUpNoShow },
    },
    notSignedUp: {
      total: notSignedUpTotal,
      attended: { count: notSignedUpAttended.length, members: notSignedUpAttended },
      benched: { count: notSignedUpBenched.length, members: notSignedUpBenched },
    },
    unmatched,
  };
}
