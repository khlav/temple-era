// src/server/api/v2/refs.ts
import { builder } from "./builder";
import type { characters, raids, raidLogs } from "~/server/db/schema";
import type {
  RaidAttendanceData,
  CharacterStatusData,
  FamilyStatusData,
} from "./types/attendance-types";

type CharacterRow = typeof characters.$inferSelect;
type RaidRow = typeof raids.$inferSelect;
type RaidLogRow = typeof raidLogs.$inferSelect;

export type { CharacterRow, RaidRow, RaidLogRow };

export const CharacterRef = builder.objectRef<CharacterRow>("Character");
export const CharacterFamilyRef = builder.objectRef<{ primaryCharacterId: number }>(
  "CharacterFamily",
);
export const RaidRef = builder.objectRef<RaidRow>("Raid");
export const RaidLogRef = builder.objectRef<RaidLogRow>("RaidLog");
export const RaidLogAttendeeRef = builder.objectRef<{
  character: CharacterRow;
  status: string;
}>("RaidLogAttendee");
export const RaidAttendanceRef = builder.objectRef<RaidAttendanceData>("RaidAttendance");
export const CharacterStatusRef = builder.objectRef<CharacterStatusData>("CharacterStatus");
export const FamilyStatusRef = builder.objectRef<FamilyStatusData>("FamilyStatus");
