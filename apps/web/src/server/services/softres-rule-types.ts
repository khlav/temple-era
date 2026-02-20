/**
 * Type definitions for SoftRes rule system
 */

export type RuleLevel = "info" | "highlight" | "warning" | "future" | "error";

export interface RuleEvaluationContext {
  // Character data
  characterId: number | null; // null for unmatched characters
  characterName: string;
  characterClass: string;
  primaryCharacterId: number | null;
  primaryCharacterName: string | null;

  // Attendance statistics (null for unmatched characters)
  totalRaidsAttendedBenched: number | null;
  zoneRaidsAttended: number | null; // attended only (no bench)
  zoneRaidsAttendedBenched: number | null; // attended + benched
  primaryAttendancePct: number | null;

  // SoftRes data
  srItems: number[]; // Array of item IDs
  srItemNames?: Map<number, string>; // Optional: item ID -> name mapping
  zone: string | null; // Database zone name (mapped from SoftRes, null if unknown)
}

export interface SoftResRule {
  id: string;
  name: string;
  description: string | ((ctx: RuleEvaluationContext) => string);
  level: RuleLevel;
  evaluate: (ctx: RuleEvaluationContext) => boolean;
  icon: string; // lucide-react icon name
}
