import { z } from "zod";

import {
  createTRPCRouter,
  // publicProcedure,
  // protectedProcedure,
  adminProcedure,
} from "~/server/api/trpc";
import {GetWCLGraphQLQuery} from "~/server/db/api/helpers";
import {RawActorResult, RawRaidReportRequestResult} from "~/server/api/interfaces/wcl";
import {RaidParticipant, RaidLog, RaidParticipantCollection} from "~/server/api/interfaces/raid";

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


const ActorToRaidParticipant = (actor: RawActorResult) => {
  const newRaidParticipant: RaidParticipant = {
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

  const newReport: RaidLog = {
    title: rawReport.title,
    raidLogId: rawReport.code,
    startTimeUTC: new Date(rawReport.startTime),
    endTimeUTC: new Date(rawReport.endTime),
    zone: rawReport.zone.name,
    kills: kills.map((fight)=> fight.name),
    // participants: rawReport.masterData.actors.map(ActorToRaidParticipant).sort((a,b) => (a.characterId > b.characterId ? 1 : -1))
    participants: rawReport.masterData.actors.reduce((acc, actor) => {
      const newParticipant = ActorToRaidParticipant(actor);
      acc[newParticipant.characterId] = newParticipant;
      return acc;
    }, {} as RaidParticipantCollection)
  };

  return newReport;
};

export const wcl = createTRPCRouter({
  getRaidById: adminProcedure
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
