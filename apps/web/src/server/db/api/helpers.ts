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
  const accessToken: string = tokenData.access_token;

  // GraphQL query example
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

  // Return the fetched data
  return NextResponse.json({
    ...apiData
  });
}