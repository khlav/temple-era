// src/server/api/v2/types/attendance.ts
import {
  RaidAttendanceRef,
  CharacterStatusRef,
  FamilyStatusRef,
  RaidRef,
  CharacterRef,
} from "../refs";
import { AttendanceStatusEnum } from "./enums";

RaidAttendanceRef.implement({
  fields: (t) => ({
    raid: t.field({ type: RaidRef, resolve: (r) => r.raid }),
    status: t.field({ type: AttendanceStatusEnum, resolve: (r) => r.status }),
  }),
});

CharacterStatusRef.implement({
  fields: (t) => ({
    character: t.field({ type: CharacterRef, resolve: (r) => r.character }),
    status: t.field({ type: AttendanceStatusEnum, resolve: (r) => r.status }),
  }),
});

FamilyStatusRef.implement({
  fields: (t) => ({
    status: t.field({ type: AttendanceStatusEnum, resolve: (r) => r.status }),
    attendees: t.field({ type: [CharacterRef], resolve: (r) => r.attendees }),
  }),
});
