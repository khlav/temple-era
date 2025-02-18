export interface AccessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export const GetOauthClientCredentialAccessToken = async (
  oauth_url: string,
  client_id: string,
  client_secret: string,
) => {
  return await fetch(oauth_url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: client_id || "",
      client_secret: client_secret || "",
    }),
  });
};
