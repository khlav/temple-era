// src/server/api/v2/types/attendance-types.ts
import type { CharacterRow, RaidRow } from "../refs";

export type RaidAttendanceData = {
  raid: RaidRow;
  status: "ATTENDED" | "BENCH" | "ABSENT";
};

export type CharacterStatusData = {
  character: CharacterRow;
  status: "ATTENDED" | "BENCH" | "ABSENT";
};

export type FamilyStatusData = {
  status: "ATTENDED" | "BENCH" | "ABSENT";
  attendees: CharacterRow[];
};
