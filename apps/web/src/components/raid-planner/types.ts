/**
 * Raid Planner Types
 * Centralized type definitions for the raid-planner feature.
 */

export interface RaidPlanCharacter {
  id: string;
  characterId: number | null;
  characterName: string;
  defaultGroup: number | null;
  defaultPosition: number | null;
  class: string | null;
  server: string | null;
}

export interface CharacterMoveEvent {
  planCharacterId: string;
  targetGroup: number | null;
  targetPosition: number | null;
}

export interface CharacterSwapEvent {
  planCharacterIdA: string;
  planCharacterIdB: string;
}

export interface SlotFillEvent {
  targetGroup: number;
  targetPosition: number;
  characterId: number | null;
  characterName: string;
  writeInClass?: string | null;
}

export interface CharacterDeleteEvent {
  planCharacterId: string;
}

export interface AASlotAssignment {
  id: string;
  encounterId: string | null;
  raidPlanId: string | null;
  planCharacterId: string;
  slotName: string;
  sortOrder: number;
}

export interface AASlotCharacter {
  planCharacterId: string;
  characterName: string;
  characterClass: string | null;
  sortOrder: number;
  isHighlighted?: boolean;
}

export interface EncounterAssignment {
  encounterId: string;
  planCharacterId: string;
  groupNumber: number | null;
  position: number | null;
}

/**
 * Build encounter-specific character list by overlaying encounter assignments
 * on top of the plan's character list.
 */
export function buildEncounterCharacters(
  planCharacters: RaidPlanCharacter[],
  encounterAssignments: EncounterAssignment[],
  encounterId: string,
): RaidPlanCharacter[] {
  const assignmentMap = new Map(
    encounterAssignments
      .filter((a) => a.encounterId === encounterId)
      .map((a) => [a.planCharacterId, a]),
  );

  return planCharacters.map((char) => {
    const assignment = assignmentMap.get(char.id);
    if (assignment) {
      return {
        ...char,
        defaultGroup: assignment.groupNumber,
        defaultPosition: assignment.position,
      };
    }
    // No assignment row = bench for this encounter
    return { ...char, defaultGroup: null, defaultPosition: null };
  });
}
