export interface RawFightResult {
  id: string;
  name: string;
  encounterID: string;
  difficulty: number;
  kill: boolean;
  bossPercentage: number;
  startTime: number;
  endTime: number;
  gameZone: {
    id: string;
    name: string;
  };
  friendlyPlayers: number[];
}

export interface RawActorResult {
  id: number;
  gameID: number;
  name: string;
  server: string;
  subType: string;
  icon: string;
}

export type RawActorResultCollection = Record<string, RawActorResult>;

export interface RawRaidLogReportResult {
  code: string;
  title: string;
  startTime: number;
  endTime: number;
  guild: {
    id: number;
    name: string;
  };
  zone: {
    id: number;
    name: string;
  };
  fights: RawFightResult[];
  masterData: {
    actors: RawActorResult[];
  };
}

export interface RawRaidReportRequestResult {
  data: {
    reportData: {
      report: RawRaidLogReportResult;
    };
  };
}
