export interface RaidParticipant {
  characterId: number;
  name: string;
  class: string;
  classDetail: string;
  server: string;
}

export type RaidParticipantCollection = Record<string, RaidParticipant>;

export interface RaidLog {
  raidLogId: string; // code
  title: string;
  startTimeUTC: Date;
  endTimeUTC: Date;
  zone: string;
  kills: string[];
  participants: RaidParticipantCollection;
}

export type RaidLogCollection = Record<string, RaidLog>;

export interface Raid {
  raidId: number | undefined;
  name: string;
  date: Date;
  attendanceWeight: number;
  raidLogs: RaidLogCollection;
  bench: RaidParticipantCollection;
}