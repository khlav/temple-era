import type {
  RawActorResult,
  RawActorResultCollection,
  RawRaidReportRequestResult,
} from "~/server/api/interfaces/wcl";
import type {
  RaidLog,
  RaidParticipant,
  RaidParticipantCollection,
} from "~/server/api/interfaces/raid";
import { env } from "~/env";
import { NextResponse } from "next/server";
import {
  type AccessTokenResponse,
  GetOauthClientCredentialAccessToken,
} from "~/server/api/oauth-helpers";

export const Slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export const GetWCLGraphQLQuery = async (gqlQuery: string, gqlVariables: object) => {
  const OAUTH_URL = env.WCL_OAUTH_URL;
  const API_URL = env.WCL_API_URL;

  // Fetch user-management token
  const accessTokenResponse = await GetOauthClientCredentialAccessToken(
    OAUTH_URL,
    env.WCL_CLIENT_ID,
    env.WCL_CLIENT_SECRET,
  );

  if (!accessTokenResponse.ok) {
    // Throw rather than return an error body. This used to answer with `{ error }` and no `data`,
    // which every caller then fed straight to `RaidReportDataShaper` — so a Warcraft Logs outage
    // surfaced as `Cannot read properties of undefined (reading 'reportData')` rather than as
    // itself. See the 2026-11-18 Naxx log that never became a raid.
    throw new Error(
      `Failed to fetch Warcraft Logs access token (URL: ${OAUTH_URL}, status: ${accessTokenResponse.status})`,
    );
  }

  const tokenData = (await accessTokenResponse.json()) as AccessTokenResponse;
  const accessToken = tokenData.access_token;

  const graphqlQuery = {
    query: gqlQuery,
    variables: gqlVariables,
  };

  // Fetch data from GraphQL API
  const apiResponse = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(graphqlQuery),
  });

  if (!apiResponse.ok) {
    throw new Error(`Warcraft Logs API request failed (status: ${apiResponse.status})`);
  }

  const apiData = (await apiResponse.json()) as object;
  return NextResponse.json({
    ...apiData,
  });
};

const ActorToRaidParticipant = (actor: RawActorResult) => {
  const newRaidParticipant: RaidParticipant = {
    characterId: actor.gameID,
    name: actor.name,
    class: actor.subType,
    classDetail: actor.icon,
    server: actor.server,
  };
  return newRaidParticipant;
};

/**
 * A Warcraft Logs report that exists but has no encounter data yet. A live log uploaded at the
 * pull — before the raid's first boss — comes back with `zone: null`, no fights and sometimes no
 * masterData, so there is no zone to weight attendance by and nobody to credit. That is a "not
 * yet", not a failure: the caller is expected to try again rather than give up.
 *
 * `title` is carried because it survives on an otherwise-empty report, and it is the only thing
 * available to name a thread with before the raid exists.
 */
export class WclReportIncompleteError extends Error {
  readonly reportId: string;
  readonly title: string | null;

  constructor(reportId: string, title: string | null) {
    super(`Warcraft Logs report ${reportId} has no encounter data yet`);
    this.name = "WclReportIncompleteError";
    this.reportId = reportId;
    this.title = title;
  }
}

export const RaidReportDataShaper = (apiData: RawRaidReportRequestResult) => {
  const rawReport = apiData?.data?.reportData?.report;
  if (!rawReport) {
    throw new Error("Warcraft Logs returned no report for this code");
  }

  // No zone means Warcraft Logs has not seen an encounter yet. Everything downstream — the raid's
  // zone and therefore its attendance weight — depends on it, so stop here rather than importing a
  // zoneless log that would silently credit nobody.
  //
  // `fights` and `masterData` are held to the same bar, and deliberately on `null` rather than on
  // emptiness. Null means Warcraft Logs did not report the field; an empty array means it reported
  // nothing in it, which is a legitimate answer. The distinction matters because this shaper feeds
  // *refreshes* as well as first imports, and a refresh rewrites `kills` and deletes the log's
  // attendees before re-inserting them. Defaulting a null to `[]` would turn "not reported" into
  // "nobody was there" and wipe an imported raid's attendance.
  if (!rawReport.zone || !rawReport.fights || !rawReport.masterData) {
    throw new WclReportIncompleteError(rawReport.code, rawReport.title ?? null);
  }

  const fights = rawReport.fights;
  const actors = rawReport.masterData.actors ?? [];
  const kills = fights.filter((fight) => fight.kill);

  const localIdActorCollection = actors.reduce((acc, actor) => {
    acc[actor.id] = actor;
    return acc;
  }, {} as RawActorResultCollection);

  const participantsFromFights = fights.reduce((acc, rel) => {
    rel.friendlyPlayers.map((actorId) => {
      const actor = localIdActorCollection[actorId] ?? ({} as RawActorResult);
      const newParticipant = ActorToRaidParticipant(actor);
      acc[newParticipant.characterId] = newParticipant;
    });
    return acc;
  }, {} as RaidParticipantCollection);

  const newReport: RaidLog = {
    name: rawReport.title,
    raidLogId: rawReport.code,
    startTimeUTC: new Date(rawReport.startTime),
    endTimeUTC: new Date(rawReport.endTime),
    zone: rawReport.zone.name,
    kills: kills.map((fight) => fight.name),
    participants: participantsFromFights,
  };

  return newReport;
};
