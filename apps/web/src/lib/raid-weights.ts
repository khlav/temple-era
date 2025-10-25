/**
 * Shared utility for determining raid attendance weights based on zone names
 */

export const getDefaultAttendanceWeight = (zoneName: string): number => {
  const attendanceWeightedZones = {
    Naxxramas: 1,
    "Temple of Ahn'Qiraj": 1,
    "Blackwing Lair": 1,
    "Molten Core": 0.5,
  } as const; // Make the object immutable

  return (
    attendanceWeightedZones[zoneName as keyof typeof attendanceWeightedZones] ??
    0
  );
};
