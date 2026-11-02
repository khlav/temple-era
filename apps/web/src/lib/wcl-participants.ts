import type { RaidParticipant } from "~/server/api/interfaces/raid";

/**
 * Whether Warcraft Logs actually knew who this player was. When the logger saw a player's id but
 * never their name, WCL still lists them in the fight, but as `name: "nil"`, `server: null`,
 * `subType: "Unknown"` — and a fight player missing from `masterData.actors` arrives as an empty
 * object. The id is the real character's, but WCL only fails to name a player it never saw act:
 * Peazie, disconnected for the 2026-11-01 clean-up, came through this way with no damage, healing
 * or casts. So an unresolved player is not an attendee.
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
 * Splits a log's participants into real attendees and the ids of WCL's unnamed placeholders,
 * which the caller logs and leaves out. Entries with no id at all are dropped silently.
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
