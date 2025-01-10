import {RawActorResult, RawActorResultCollection, RawRaidReportRequestResult} from "~/server/api/interfaces/wcl";
import {RaidLog, RaidParticipant, RaidParticipantCollection} from "~/server/api/interfaces/raid";
import {env} from "~/env";
import {NextResponse} from "next/server";

interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export const GetWCLGraphQLQuery = async (
  gqlQuery: string,
  gqlVariables: object
) => {
  const OAUTH_URL = env.WCL_OAUTH_URL;
  const API_URL = env.WCL_API_URL;

  // Fetch access token
  const accessTokenResponse = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.WCL_CLIENT_ID || '',
      client_secret: env.WCL_CLIENT_SECRET || '',
    }),
  });

  if (!accessTokenResponse.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch access token' },
      { status: accessTokenResponse.status }
    );
  }

  const tokenData: AccessTokenResponse = (await accessTokenResponse.json() as AccessTokenResponse);
  const accessToken = tokenData.access_token;

  const graphqlQuery = {
    query: gqlQuery,
    variables: gqlVariables,
  };

  // Fetch data from GraphQL API
  const apiResponse = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!apiResponse.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch data from API' },
      { status: apiResponse.status }
    );
  }

  const apiData = await apiResponse.json() as object;
  return NextResponse.json({
    ...apiData
  });
}
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

  const localIdActorCollection = rawReport.masterData.actors
    .reduce((acc, actor) => {
      acc[actor.id] = actor;
      return acc;
    }, {} as RawActorResultCollection)

  const participantsFromFights = rawReport.fights.reduce((acc, rel) => {
    rel.friendlyPlayers.map((actorId) => {
      const actor = localIdActorCollection[actorId] ?? {} as RawActorResult;
      const newParticipant = ActorToRaidParticipant(actor);
      acc[newParticipant.characterId] = newParticipant;
    })
      return acc;
    }  , {} as RaidParticipantCollection)
  
  const newReport: RaidLog = {
    name: rawReport.title,
    raidLogId: rawReport.code,
    startTimeUTC: new Date(rawReport.startTime),
    endTimeUTC: new Date(rawReport.endTime),
    zone: rawReport.zone.name,
    kills: kills.map((fight)=> fight.name),
    participants: participantsFromFights,
  };

  return newReport;
};