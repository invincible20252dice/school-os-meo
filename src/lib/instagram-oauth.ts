type FetchLike = typeof fetch;

export const DEFAULT_META_APP_ID = "4340844179393244";
export const DEFAULT_META_APP_SECRET = "REPLACE_WITH_META_APP_SECRET";
export const DEFAULT_NGROK_APP_URL = "https://buffing-sedate-doormat.ngrok-free.dev";

type InstagramOAuthConfig = {
  metaAppId?: string;
  metaAppSecret?: string;
  redirectUri?: string;
  state?: string;
};

type TokenResponse = {
  access_token?: string;
};

type AccountsResponse = {
  data?: Array<{
    instagram_business_account?: {
      id?: string;
    };
  }>;
};

export function toSecureBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/$/, "");

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("http://")
    ? trimmed.replace("http://", "https://")
    : trimmed;
}

function isLocalOrigin(value: string) {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch {
    return false;
  }
}

function toInstagramRedirectBaseUrl(value: string) {
  const secureBaseUrl = toSecureBaseUrl(value);

  if (isLocalOrigin(secureBaseUrl)) {
    return DEFAULT_NGROK_APP_URL;
  }

  return secureBaseUrl;
}

export function getInstagramRedirectUri(requestUrl?: string, forwardedOrigin?: string) {
  if (process.env.INSTAGRAM_REDIRECT_URI) {
    return toSecureBaseUrl(process.env.INSTAGRAM_REDIRECT_URI);
  }

  const configuredBaseUrl =
    process.env.NGROK_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configuredBaseUrl) {
    return `${toInstagramRedirectBaseUrl(configuredBaseUrl)}/api/auth/callback/instagram`;
  }

  if (forwardedOrigin) {
    return `${toInstagramRedirectBaseUrl(forwardedOrigin)}/api/auth/callback/instagram`;
  }

  if (requestUrl) {
    const url = new URL(requestUrl);
    return `${toInstagramRedirectBaseUrl(url.origin)}/api/auth/callback/instagram`;
  }

  return `${DEFAULT_NGROK_APP_URL}/api/auth/callback/instagram`;
}

export function getForwardedOrigin(headers: Headers) {
  const forwardedHost = headers.get("x-forwarded-host");

  if (!forwardedHost) {
    return undefined;
  }

  const forwardedProto = headers.get("x-forwarded-proto") || "https";
  return `${forwardedProto}://${forwardedHost}`;
}

export function buildInstagramOAuthUrl(config: InstagramOAuthConfig) {
  const appId = config.metaAppId?.trim() || process.env.META_APP_ID?.trim() || DEFAULT_META_APP_ID;

  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("redirect_uri", config.redirectUri || getInstagramRedirectUri());
  url.searchParams.set(
    "scope",
    [
      "instagram_basic",
      "pages_show_list",
      "pages_read_engagement",
      "business_management",
    ].join(","),
  );
  url.searchParams.set("response_type", "code");

  if (config.state) {
    url.searchParams.set("state", config.state);
  }

  return url.toString();
}

export async function exchangeInstagramCode({
  code,
  redirectUri,
  metaAppId,
  metaAppSecret,
  fetchImpl = fetch,
}: {
  code: string;
  redirectUri: string;
  metaAppId?: string;
  metaAppSecret?: string;
  fetchImpl?: FetchLike;
}) {
  const appId = metaAppId?.trim() || process.env.META_APP_ID?.trim() || DEFAULT_META_APP_ID;
  const appSecret =
    metaAppSecret?.trim() ||
    process.env.META_APP_SECRET?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_SECRET?.trim() ||
    DEFAULT_META_APP_SECRET;

  const tokenUrl = new URL("https://graph.facebook.com/v21.0/oauth/access_token");
  tokenUrl.searchParams.set("client_id", appId);
  tokenUrl.searchParams.set("client_secret", appSecret);
  tokenUrl.searchParams.set("redirect_uri", redirectUri);
  tokenUrl.searchParams.set("code", code);

  const tokenResponse = await fetchImpl(tokenUrl.toString());

  if (!tokenResponse.ok) {
    throw new Error(`Instagram OAuth token exchange failed: ${tokenResponse.status}`);
  }

  const tokenData = (await tokenResponse.json()) as TokenResponse;

  if (!tokenData.access_token) {
    throw new Error("Instagram OAuth response did not include access_token.");
  }

  return tokenData.access_token;
}

export async function fetchInstagramBusinessAccountId({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: FetchLike;
}) {
  const accountsUrl = new URL("https://graph.facebook.com/v21.0/me/accounts");
  accountsUrl.searchParams.set(
    "fields",
    "instagram_business_account{id},name",
  );
  accountsUrl.searchParams.set("access_token", accessToken);
  const accountsResponse = await fetchImpl(accountsUrl.toString());

  if (!accountsResponse.ok) {
    throw new Error(`Instagram business account fetch failed: ${accountsResponse.status}`);
  }

  const accounts = (await accountsResponse.json()) as AccountsResponse;
  const businessAccountId = accounts.data?.find(
    (account) => account.instagram_business_account?.id,
  )?.instagram_business_account?.id;

  if (!businessAccountId) {
    throw new Error("Instagram business account was not found.");
  }

  return businessAccountId;
}
