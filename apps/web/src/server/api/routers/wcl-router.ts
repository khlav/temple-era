import { z } from "zod";

import {
  createTRPCRouter,
  // publicProcedure,
  // protectedProcedure,
  adminProcedure,
} from "~/server/api/trpc";
import {GetWCLGraphQLQuery} from "~/server/db/api/helpers";

export const RaidReportQuery = `
  query ($reportID: String!) {
    reportData {
      report(code: $reportID) {
        code
        title
        startTime
        endTime
        guild { id, name }
        zone { id, name }
  
        masterData {
          actors(type: "Player") {
            id
            gameID
            name
            server
            subType
            icon
          }
        }
        
        fights(killType: Encounters) {
          id
          name
          encounterID
          difficulty
          kill
          bossPercentage
          startTime
          endTime
          gameZone { id, name }
          friendlyPlayers
        }
  
      }
    }
  }
`

interface RawFightResult {
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

interface RawActorResult {
  id: number;
  gameID: number;
  name: string;
  server: string;
  subType: string;
  icon: string;
}

interface RawRaidLogReportResult {
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

interface RawRaidReportRequestResult {
  data: {
    reportData: {
      report: RawRaidLogReportResult;
    };
  };
}

export interface RaidLogParticipant {
  characterId: number;
  name: string;
  class: string;
  classDetail: string;
  server: string;
}

interface RaidLogReport {
  logId: string; // code
  title: string;
  startTimeUTC: Date;
  endTimeUTC: Date;
  zone: string;
  kills: string[];
  participants: RaidLogParticipant[];
}

const ActorToRaidParticipant = (actor: RawActorResult) => {
  const newRaidParticipant: RaidLogParticipant = {
    characterId: actor.gameID,
    name: actor.name,
    class: actor.subType,
    classDetail: actor.icon,
    server: actor.server,
  }
  return newRaidParticipant;
}

export const RaidReportDataShaper = (apiData: RawRaidReportRequestResult) => {
  const rawReport = apiData.data.reportData.report;
  const kills = rawReport.fights.filter((fight) => fight.kill);

  const newReport: RaidLogReport = {
    title: rawReport.title,
    logId: rawReport.code,
    startTimeUTC: new Date(rawReport.startTime),
    endTimeUTC: new Date(rawReport.endTime),
    zone: rawReport.zone.name,
    kills: kills.map((fight)=> fight.name),
    participants: rawReport.masterData.actors.map(ActorToRaidParticipant).sort((a,b) => (a.characterId > b.characterId ? 1 : -1))
  };

  return newReport;
};

export const wclRouter = createTRPCRouter({
  getRaidbyId: adminProcedure
    .input(z.object({ id: z.string().optional() }))
    .query(async ({ input }) => {

      const query = RaidReportQuery;
      const variables = {
        "reportID": input.id
      };

      const rawRaidReportResponse = await GetWCLGraphQLQuery(query, variables);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      return RaidReportDataShaper(await rawRaidReportResponse.json());
    }),

});
