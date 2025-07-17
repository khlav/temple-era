interface User {
  name: string;
  image: string;
}

export interface RaidParticipant {
  characterId: number;
  name: string;
  class: string;
  classDetail: string;
  server: string;
  slug?: string;
  isPrimary?: boolean | null;
  primaryCharacterId?: number | null;
  primaryCharacterName?: string | null;
  primaryCharacterClass?: string | null;
  secondaryCharacters?: RaidParticipant[];
  isIgnored: boolean;
}

export type RaidParticipantCollection = Record<string, RaidParticipant>;

export interface RaidLog {
  raidLogId: string; // code
  name: string;
  raidId?: number;
  startTimeUTC: Date;
  endTimeUTC: Date;
  zone: string;
  kills: string[];
  participants: RaidParticipantCollection;
}

export type RaidLogCollection = Record<string, RaidLog>;

export interface Raid {
  raidId: number | undefined;
  name: string ;
  date: string ; // stored/manipulated as a string in forms, e.g. 2025-01-01
  zone: string ;
  attendanceWeight: number;
  raidLogIds?: string[];
  kills?: string[];
  bench: RaidParticipantCollection;
  creator?: User;
}

export const EmptyRaid = (): Raid => ({
  raidId: undefined,
  name: "",
  date: "",
  attendanceWeight: 0,
  raidLogIds: [],
  zone: "",
  bench: {}
})