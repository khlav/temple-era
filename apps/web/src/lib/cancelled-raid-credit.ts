import { getDefaultAttendanceWeight } from "~/lib/raid-weights";

/**
 * The zones that earn attendance credit each lockout week. When Temple hosts no creditable raid
 * (attendance_weight > 0) for one of them in a completed lockout week, every raider gets credit
 * for it at the zone's default weight, as though they had attended.
 *
 * The authoritative calculation is `views.primary_raid_attendance_l6lockoutwk`
 * (drizzle/0007_cancelled_raid_attendance_credit.sql); this list mirrors its `credited_zones`
 * for the attendance heatmap — keep the two in step.
 */
export const CANCELLED_CREDIT_ZONES = [
  "Naxxramas",
  "Temple of Ahn'Qiraj",
  "Blackwing Lair",
  "Molten Core",
] as const;

export type CancelledCreditZone = (typeof CANCELLED_CREDIT_ZONES)[number];

/** Credit every raider gets for a zone Temple didn't host that week. */
export const getCancelledRaidCredit = (zone: CancelledCreditZone): number =>
  getDefaultAttendanceWeight(zone);
