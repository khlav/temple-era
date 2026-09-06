import { describe, expect, it } from "vitest";
import {
  buildSignupAttendanceComparison,
  type FamilyKeyed,
} from "~/server/services/signup-attendance-comparison-buckets";
import type { SignupMatchResult } from "~/server/api/helpers/match-signups";

function matched(opts: {
  discordName: string;
  characterId: number;
  characterName: string;
  characterClass: string;
  primaryCharacterId: number | null;
}): SignupMatchResult {
  return {
    userId: `u-${opts.characterId}`,
    discordName: opts.discordName,
    className: opts.characterClass,
    specName: "",
    partyId: null,
    slotId: null,
    status: "matched",
    matchSource: "token_exact",
    matchedCharacter: {
      characterId: opts.characterId,
      characterName: opts.characterName,
      characterServer: "Ashkandi",
      characterClass: opts.characterClass,
      primaryCharacterId: opts.primaryCharacterId,
      primaryCharacterName: null,
    },
  };
}

function unmatched(discordName: string): SignupMatchResult {
  return {
    userId: `u-${discordName}`,
    discordName,
    className: "Warrior",
    specName: "",
    partyId: null,
    slotId: null,
    status: "unmatched",
    matchSource: "manual_review",
  };
}

/** A signup whose family WAS identified but couldn't be pinned to a specific alt — e.g.
 *  the signed-up class doesn't match anyone in the family ("unmatched" status), or two
 *  alts share that class ("ambiguous"). matchedCharacter is absent either way, but
 *  matchedPrimaryCharacterId/Name are set. */
function familyKnownButUnresolved(opts: {
  discordName: string;
  status: "unmatched" | "ambiguous";
  primaryCharacterId: number;
  primaryCharacterName: string;
}): SignupMatchResult {
  return {
    userId: `u-${opts.discordName}`,
    discordName: opts.discordName,
    className: "Paladin",
    specName: "Retribution",
    partyId: null,
    slotId: null,
    status: opts.status,
    matchSource: "token_exact",
    matchedPrimaryCharacterId: opts.primaryCharacterId,
    matchedPrimaryCharacterName: opts.primaryCharacterName,
  };
}

function character(id: number, name: string, cls: string, primaryId: number | null): FamilyKeyed {
  return { characterId: id, name, class: cls, primaryCharacterId: primaryId };
}

describe("buildSignupAttendanceComparison", () => {
  it("buckets a signed-up family that attended into signedUp.attended", () => {
    const matches = [
      matched({
        discordName: "Alice",
        characterId: 1,
        characterName: "Alicemage",
        characterClass: "Mage",
        primaryCharacterId: null,
      }),
    ];
    const attendeeRows = [character(1, "Alicemage", "Mage", null)];

    const result = buildSignupAttendanceComparison(matches, attendeeRows, []);

    expect(result.signedUp.attended.count).toBe(1);
    expect(result.signedUp.attended.members[0]).toMatchObject({ name: "Alicemage" });
    expect(result.signedUp.benched.count).toBe(0);
    expect(result.signedUp.noShow.count).toBe(0);
  });

  it("resolves alts to their primary character before bucketing — signing up on an alt but attending on the primary still counts as attended", () => {
    const matches = [
      matched({
        discordName: "Bob",
        characterId: 20, // Bob's priest alt
        characterName: "Bobpriest",
        characterClass: "Priest",
        primaryCharacterId: 10, // family anchor
      }),
    ];
    // Attended on the primary character (id 10), not the alt they signed up as.
    const attendeeRows = [character(10, "Bobwarrior", "Warrior", null)];

    const result = buildSignupAttendanceComparison(matches, attendeeRows, []);

    expect(result.signedUp.attended.count).toBe(1);
    // Display identity is "as signed up" — the alt's name/class, not the attended character's.
    expect(result.signedUp.attended.members[0]).toMatchObject({
      name: "Bobpriest",
      characterClass: "Priest",
    });
  });

  it("buckets a signed-up family with no attendance/bench record as a no-show", () => {
    const matches = [
      matched({
        discordName: "Carol",
        characterId: 2,
        characterName: "Carolrogue",
        characterClass: "Rogue",
        primaryCharacterId: null,
      }),
    ];

    const result = buildSignupAttendanceComparison(matches, [], []);

    expect(result.signedUp.noShow.count).toBe(1);
    expect(result.exceptionsCount).toBe(1);
  });

  it("surfaces an attended family with no signup as a not-signed-up exception", () => {
    const attendeeRows = [character(3, "Davewarlock", "Warlock", null)];

    const result = buildSignupAttendanceComparison([], attendeeRows, []);

    expect(result.notSignedUp.attended.count).toBe(1);
    expect(result.notSignedUp.attended.members[0]).toMatchObject({ name: "Davewarlock" });
    expect(result.exceptionsCount).toBe(1);
  });

  it("prefers attended over benched when a not-signed-up family shows up in both", () => {
    const attendeeRows = [character(4, "Evehunter", "Hunter", null)];
    const benchRows = [character(4, "Evehunter", "Hunter", null)];

    const result = buildSignupAttendanceComparison([], attendeeRows, benchRows);

    expect(result.notSignedUp.attended.count).toBe(1);
    expect(result.notSignedUp.benched.count).toBe(0);
  });

  it("routes an unresolved signup to the unmatched list, not the matrix", () => {
    const matches = [unmatched("Ghostname")];

    const result = buildSignupAttendanceComparison(matches, [], []);

    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]).toMatchObject({ characterId: null, name: "Ghostname" });
    expect(result.allCount).toBe(0);
    expect(result.signedUpAtZeroHour).toBe(1);
  });

  it("keeps only the first signup when the same family signs up twice", () => {
    const matches = [
      matched({
        discordName: "Frank",
        characterId: 5,
        characterName: "Frankpaladin",
        characterClass: "Paladin",
        primaryCharacterId: null,
      }),
      matched({
        discordName: "Frank-alt-entry",
        characterId: 6,
        characterName: "Frankdruid",
        characterClass: "Druid",
        primaryCharacterId: 5,
      }),
    ];

    const result = buildSignupAttendanceComparison(matches, [], []);

    expect(result.signedUp.total).toBe(1);
    expect(result.signedUp.noShow.members[0]?.name).toBe("Frankpaladin");
  });

  it("credits a family-known-but-unresolved signup as signed-up instead of double-counting them as both unmatched and an unsigned attendee", () => {
    // Reproduces the real TEMPLE-98 bug: "Eurymedon" signed up as Paladin, but the only
    // Eurymedon character in the roster is a Warrior — matchSignupsToCharacters can't pin
    // a specific alt (status "unmatched"), but it DOES know the family (matchedPrimaryCharacterId).
    const matches = [
      familyKnownButUnresolved({
        discordName: "Eurymedon",
        status: "unmatched",
        primaryCharacterId: 100,
        primaryCharacterName: "Eurymedon",
      }),
    ];
    const attendeeRows = [character(100, "Eurymedon", "Warrior", null)];

    const result = buildSignupAttendanceComparison(matches, attendeeRows, []);

    expect(result.unmatched).toHaveLength(0);
    expect(result.signedUp.attended.count).toBe(1);
    expect(result.signedUp.attended.members[0]).toMatchObject({
      characterId: 100,
      name: "Eurymedon",
    });
    expect(result.notSignedUp.attended.count).toBe(0);
  });

  it("credits an ambiguous-class signup (two same-class alts in the family) as signed-up the same way", () => {
    const matches = [
      familyKnownButUnresolved({
        discordName: "Akai/Shtank",
        status: "ambiguous",
        primaryCharacterId: 200,
        primaryCharacterName: "Shtank",
      }),
    ];
    // The family's Shaman alt (not the primary) is the one who actually attended.
    const attendeeRows = [character(201, "Amai", "Shaman", 200)];

    const result = buildSignupAttendanceComparison(matches, attendeeRows, []);

    expect(result.unmatched).toHaveLength(0);
    expect(result.signedUp.attended.count).toBe(1);
    expect(result.notSignedUp.attended.count).toBe(0);
  });

  it("still routes a signup with no family identified at all to the unmatched list", () => {
    const matches = [unmatched("Totallyunknown")];

    const result = buildSignupAttendanceComparison(matches, [], []);

    expect(result.unmatched).toHaveLength(1);
    expect(result.signedUp.total).toBe(0);
  });

  it("counts attended/benched from the raw attendance rows, not the family-collapsed matrix", () => {
    // Two characters from the same family both show up in the raid log — the top-line
    // stat mirrors the Attendance tab's own per-character count.
    const attendeeRows = [
      character(7, "Graceshaman", "Shaman", null),
      character(8, "Gracepriest", "Priest", 7),
    ];

    const result = buildSignupAttendanceComparison([], attendeeRows, []);

    expect(result.attendedCount).toBe(2);
  });
});
