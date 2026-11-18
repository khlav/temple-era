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
  /**
   * Null until Warcraft Logs has seen an encounter. A live log uploaded at the pull — before the
   * raid's first boss — arrives with no zone, no fights and sometimes no masterData, so every one
   * of these is nullable in practice however the schema reads.
   */
  zone: {
    id: number;
    name: string;
  } | null;
  fights: RawFightResult[] | null;
  masterData: {
    actors: RawActorResult[];
  } | null;
}

export interface RawRaidReportRequestResult {
  data: {
    reportData: {
      report: RawRaidLogReportResult | null;
    };
  };
}
