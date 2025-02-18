import { env } from "~/env";
import { NextResponse } from "next/server";
import anyAscii from "any-ascii";
import {
  AccessTokenResponse,
  GetOauthClientCredentialAccessToken,
} from "~/server/api/oauth-helpers";

const WOWCLASSIC_ITEM_SEARCH_API_URL =
  "https://us.api.blizzard.com/data/wow/search/item";

const WOWCLASSIC_ITEM_DETAILS_API_URL =
  "https://us.api.blizzard.com/data/wow/item/";

const GenerateWOWClassicAPIHeaders = (token: string) => ({
  "Authorization": `Bearer ${token}`,
  "Battlenet-Namespace": `static-classic1x-us`,
});

export const GetWOWClassicRecipeSearchResults = async (search: string) => {
  const OAUTH_URL = env.BATTLENET_OAUTH_URL;

  const accessTokenResponse = await GetOauthClientCredentialAccessToken(
    OAUTH_URL,
    env.BATTLENET_CLIENT_ID,
    env.BATTLENET_CLIENT_SECRET,
  );

  if (!accessTokenResponse.ok) {
    return NextResponse.json(
      { error: `Failed to fetch user-management token (URL: ${OAUTH_URL})` },
      { status: accessTokenResponse.status },
    );
  }

  const tokenData = (await accessTokenResponse.json()) as AccessTokenResponse;
  const accessToken = tokenData.access_token;

  const params = new URLSearchParams({
    orderby: "level:desc",
    _page: "1",
    "item_class.name.en_US": "Recipe",
  });

  search.split(" ").map((w) => {
    params.append("name.en_US", w);
  })

  const urlWithParams = `${WOWCLASSIC_ITEM_SEARCH_API_URL}?${params}`;
  const headers = GenerateWOWClassicAPIHeaders(accessToken);

  const apiResponse = await fetch(urlWithParams, {
    method: 'GET',
    headers: headers,
  });


  if (!apiResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch data from API" },
      { status: apiResponse.status },
    );
  }

  const apiData = (await apiResponse.json()) as object;
  return NextResponse.json({
    ...apiData
  });
};
