/**
 * Badge evaluation logic for character achievement badges
 */

/**
 * Weekly attendance week structure (from getWeeklyPrimaryCharacterAttendance)
 */
export interface WeeklyAttendanceWeek {
  weekStart: string;
  isHistorical: boolean;
  zones: {
    naxxramas?: {
      attended: boolean;
      attendanceWeight: number;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
    };
    aq40?: {
      attended: boolean;
      attendanceWeight: number;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
    };
    bwl?: {
      attended: boolean;
      attendanceWeight: number;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
    };
    mc?: {
      attended: boolean;
      attendanceWeight: number;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
      isGrayed: boolean;
    };
    onyxia?: {
      attended: boolean;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
    };
    aq20?: {
      attended: boolean;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
    };
    zg?: {
      attended: boolean;
      raids: Array<{
        name: string;
        status: "attendee" | "bench";
        characterNames: string[];
      }>;
    };
  };
}

/**
 * Badge evaluation context
 */
export interface BadgeEvaluationContext {
  weeks: WeeklyAttendanceWeek[];
  weightedAttendance: number;
  weightedAttendancePct: number;
}

/**
 * Find the longest consecutive streak of weeks matching a predicate
 */
function findLongestConsecutive(
  weeks: WeeklyAttendanceWeek[],
  predicate: (week: WeeklyAttendanceWeek) => boolean,
): number {
  let maxStreak = 0;
  let currentStreak = 0;

  for (const week of weeks) {
    if (predicate(week)) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }

  return maxStreak;
}

/**
 * Check if character attended specific zones in the given weeks
 */
function hasAttendedZones(
  weeks: WeeklyAttendanceWeek[],
  zones: Array<keyof WeeklyAttendanceWeek["zones"]>,
): boolean {
  const attendedZones = new Set<string>();

  for (const week of weeks) {
    for (const zone of zones) {
      if (week.zones[zone]?.attended) {
        attendedZones.add(zone);
      }
    }
  }

  return zones.every((zone) => attendedZones.has(zone));
}

/**
 * Count unique 20-man raids attended across all weeks
 */
function count20ManRaidsAttended(weeks: WeeklyAttendanceWeek[]): number {
  const attendedRaids = new Set<string>();

  for (const week of weeks) {
    if (week.zones.onyxia?.attended) attendedRaids.add("onyxia");
    if (week.zones.aq20?.attended) attendedRaids.add("aq20");
    if (week.zones.zg?.attended) attendedRaids.add("zg");
  }

  return attendedRaids.size;
}

/**
 * Check if character attended both 40-man and 20-man raids in the same week
 */
function hasBothSizesInSameWeek(weeks: WeeklyAttendanceWeek[]): boolean {
  for (const week of weeks) {
    const has40Man =
      week.zones.naxxramas?.attended ||
      week.zones.aq40?.attended ||
      week.zones.bwl?.attended ||
      week.zones.mc?.attended;

    const has20Man =
      week.zones.onyxia?.attended ||
      week.zones.aq20?.attended ||
      week.zones.zg?.attended;

    if (has40Man && has20Man) {
      return true;
    }
  }

  return false;
}

/**
 * Check if character attended all 7 raid instances in a single week
 */
function hasAllInstancesInSameWeek(weeks: WeeklyAttendanceWeek[]): boolean {
  for (const week of weeks) {
    const hasAll =
      week.zones.naxxramas?.attended &&
      week.zones.aq40?.attended &&
      week.zones.bwl?.attended &&
      week.zones.mc?.attended &&
      week.zones.onyxia?.attended &&
      week.zones.aq20?.attended &&
      week.zones.zg?.attended;

    if (hasAll) {
      return true;
    }
  }

  return false;
}

/**
 * Check if character earned full week credit entirely through bench in any week
 */
function hasFullBenchWeek(weeks: WeeklyAttendanceWeek[]): boolean {
  for (const week of weeks) {
    const zones = [
      week.zones.naxxramas,
      week.zones.aq40,
      week.zones.bwl,
      week.zones.mc,
    ].filter((z) => z !== undefined);

    if (zones.length === 0) continue;

    // Check if at least one zone has raids
    const hasRaids = zones.some((zone) => zone.raids.length > 0);
    if (!hasRaids) continue;

    // Check if all raids across all zones are bench status
    const allBench = zones.every((zone) =>
      zone.raids.every((raid) => raid.status === "bench"),
    );

    // Calculate total attendance weight from bench raids
    const totalWeight = zones.reduce(
      (sum, zone) => sum + (zone.attendanceWeight ?? 0),
      0,
    );

    // Full week credit = 3.0
    if (allBench && totalWeight >= 3.0) {
      return true;
    }
  }

  return false;
}

/**
 * Check if character used multiple characters in the same week
 */
function hasMultipleCharactersInSameWeek(
  weeks: WeeklyAttendanceWeek[],
): boolean {
  for (const week of weeks) {
    const allCharacterNames = new Set<string>();

    const zones = [
      week.zones.naxxramas,
      week.zones.aq40,
      week.zones.bwl,
      week.zones.mc,
      week.zones.onyxia,
      week.zones.aq20,
      week.zones.zg,
    ].filter((z) => z !== undefined);

    for (const zone of zones) {
      for (const raid of zone.raids) {
        for (const charName of raid.characterNames) {
          allCharacterNames.add(charName);
        }
      }
    }

    if (allCharacterNames.size > 1) {
      return true;
    }
  }

  return false;
}

/**
 * Check if character only attended in last 1-2 weeks (weeks 4-5 of 0-5 indexed)
 */
function isFreshFace(weeks: WeeklyAttendanceWeek[]): boolean {
  // Only use the 6 scoring weeks (filter out historical)
  const scoringWeeks = weeks.filter((w) => !w.isHistorical);
  if (scoringWeeks.length < 6) return false;

  // Check if no attendance in weeks 0-3
  const earlyWeeks = scoringWeeks.slice(0, 4);
  const hasEarlyAttendance = earlyWeeks.some((week) => {
    return (
      week.zones.naxxramas?.attended ||
      week.zones.aq40?.attended ||
      week.zones.bwl?.attended ||
      week.zones.mc?.attended ||
      week.zones.onyxia?.attended ||
      week.zones.aq20?.attended ||
      week.zones.zg?.attended
    );
  });

  // Check if has attendance in weeks 4-5
  const lateWeeks = scoringWeeks.slice(4, 6);
  const hasLateAttendance = lateWeeks.some((week) => {
    return (
      week.zones.naxxramas?.attended ||
      week.zones.aq40?.attended ||
      week.zones.bwl?.attended ||
      week.zones.mc?.attended ||
      week.zones.onyxia?.attended ||
      week.zones.aq20?.attended ||
      week.zones.zg?.attended
    );
  });

  return !hasEarlyAttendance && hasLateAttendance;
}

/**
 * Evaluate a single badge
 */
export function evaluateBadge(
  badgeId: string,
  context: BadgeEvaluationContext,
): boolean {
  // Only use the 6 scoring weeks (filter out historical and current week if present)
  const scoringWeeks = context.weeks.filter((w) => !w.isHistorical);

  switch (badgeId) {
    // Common badges
    case "fresh-face":
      return isFreshFace(context.weeks);

    case "bench-warmer":
      return hasFullBenchWeek(scoringWeeks);

    case "shapeshifter":
      return hasMultipleCharactersInSameWeek(scoringWeeks);

    // Uncommon badges
    case "dungeon-crawler":
      return hasAttendedZones(scoringWeeks, ["naxxramas", "aq40", "bwl", "mc"]);

    case "tight-squad":
      return count20ManRaidsAttended(scoringWeeks) >= 3;

    case "big-and-small":
      return hasBothSizesInSameWeek(scoringWeeks);

    // Rare badges (consecutive attendance)
    case "fire-walker":
      return (
        findLongestConsecutive(
          scoringWeeks,
          (week) => week.zones.mc?.attended ?? false,
        ) >= 4
      );

    case "dragon-slayer":
      return (
        findLongestConsecutive(
          scoringWeeks,
          (week) => week.zones.bwl?.attended ?? false,
        ) >= 4
      );

    case "bug-whisperer":
      return (
        findLongestConsecutive(
          scoringWeeks,
          (week) => week.zones.aq40?.attended ?? false,
        ) >= 4
      );

    case "necromancer":
      return (
        findLongestConsecutive(
          scoringWeeks,
          (week) => week.zones.naxxramas?.attended ?? false,
        ) >= 4
      );

    // Epic badges
    case "iron-will":
      return (
        findLongestConsecutive(scoringWeeks, (week) => {
          return !!(
            week.zones.naxxramas?.attended ||
            week.zones.aq40?.attended ||
            week.zones.bwl?.attended ||
            week.zones.mc?.attended ||
            week.zones.onyxia?.attended ||
            week.zones.aq20?.attended ||
            week.zones.zg?.attended
          );
        }) >= 6
      );

    case "dedicated":
      return (
        findLongestConsecutive(scoringWeeks, (week) => {
          const attendedZones = [
            week.zones.naxxramas,
            week.zones.aq40,
            week.zones.bwl,
            week.zones.mc,
            week.zones.onyxia,
            week.zones.aq20,
            week.zones.zg,
          ].filter((z) => z?.attended).length;

          return attendedZones >= 2;
        }) >= 4
      );

    case "completionist":
      return hasAllInstancesInSameWeek(scoringWeeks);

    // Legendary badges
    case "perfect-attendance":
      return context.weightedAttendance >= 18;

    default:
      return false;
  }
}

/**
 * Evaluate all badges for a character
 */
export function evaluateAllBadges(
  context: BadgeEvaluationContext,
): Map<string, boolean> {
  const results = new Map<string, boolean>();

  // List of all badge IDs
  const badgeIds = [
    "fresh-face",
    "bench-warmer",
    "shapeshifter",
    "dungeon-crawler",
    "tight-squad",
    "big-and-small",
    "fire-walker",
    "dragon-slayer",
    "bug-whisperer",
    "necromancer",
    "iron-will",
    "dedicated",
    "completionist",
    "perfect-attendance",
  ];

  for (const badgeId of badgeIds) {
    results.set(badgeId, evaluateBadge(badgeId, context));
  }

  return results;
}
