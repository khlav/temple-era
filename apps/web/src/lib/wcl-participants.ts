import type { RaidParticipant } from "~/server/api/interfaces/raid";

/**
 * Whether Warcraft Logs actually knew who this player was. When the logger saw a player's id but
 * never their name, WCL still lists them in the fight, but as `name: "nil"`, `server: null`,
 * `subType: "Unknown"` — and a fight player missing from `masterData.actors` arrives as an empty
 * object. The game id is still the real character's (a 2026-11-01 clean-up log listed Peazie this
 * way), so such a player still attended; only their name, server and class can't be trusted.
 */
export function isResolvedParticipant(participant: Partial<RaidParticipant>): boolean {
  return (
    typeof participant.characterId === "number" &&
    !!participant.name &&
    participant.name !== "nil" &&
    !!participant.server &&
    !!participant.class
  );
}

/**
 * Splits a log's participants into ones whose character data can be written as-is and placeholder
 * ones that only carry a usable character id. Entries with no id at all are dropped: there is no
 * character to credit.
 */
export function partitionParticipants(participants: Array<Partial<RaidParticipant>>): {
  resolved: RaidParticipant[];
  unresolvedIds: number[];
} {
  const resolved: RaidParticipant[] = [];
  const unresolvedIds: number[] = [];
  for (const participant of participants) {
    if (isResolvedParticipant(participant)) resolved.push(participant as RaidParticipant);
    else if (typeof participant.characterId === "number") {
      unresolvedIds.push(participant.characterId);
    }
  }
  return { resolved, unresolvedIds };
}
