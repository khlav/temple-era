import type {RawActorResult, RawActorResultCollection, RawRaidReportRequestResult} from "~/server/api/interfaces/wcl";
import type {RaidLog, RaidParticipant, RaidParticipantCollection} from "~/server/api/interfaces/raid";
import {env} from "~/env";
import {NextResponse} from "next/server";
import anyAscii from "any-ascii";
import {AccessTokenResponse, GetOauthClientCredentialAccessToken} from "~/server/api/oauth-helpers";

export const Slugify = (value: string) => {
  return anyAscii(value).toLowerCase();
};

export const GetWCLGraphQLQuery = async (
  gqlQuery: string,
  gqlVariables: object
) => {
  const OAUTH_URL = env.WCL_OAUTH_URL;
  const API_URL = env.WCL_API_URL;

  // Fetch user-management token
  const accessTokenResponse = await GetOauthClientCredentialAccessToken(
    OAUTH_URL,
    env.WCL_CLIENT_ID,
    env.WCL_CLIENT_SECRET
  );

  if (!accessTokenResponse.ok) {
    return NextResponse.json(
      { error: `Failed to fetch user-management token (URL: ${OAUTH_URL})` },
      { status: accessTokenResponse.status }
    );
  }

  const tokenData = (await accessTokenResponse.json() as AccessTokenResponse);
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

  console.log(Object.keys(participantsFromFights).length)

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