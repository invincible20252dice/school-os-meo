type FetchLike = typeof fetch;

export const GOOGLE_BUSINESS_SCOPE =
  "https://www.googleapis.com/auth/business.manage";
export const GOOGLE_PROFILE_SCOPES = ["openid", "email"];

type GoogleOAuthConfig = {
  clientId?: string;
  redirectUri?: string;
  state?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GoogleTokenInfoResponse = {
  email?: string;
};

type GbpAccountsResponse = {
  accounts?: Array<{
    name?: string;
    accountName?: string;
    type?: string;
  }>;
  nextPageToken?: string;
};

type GbpLocationsResponse = {
  locations?: GbpLocationResponse[];
  nextPageToken?: string;
};

type GbpLocationResponse = {
  name?: string;
  title?: string;
  storeCode?: string;
  storefrontAddress?: {
    addressLines?: string[];
    locality?: string;
    administrativeArea?: string;
    postalCode?: string;
  };
  metadata?: {
    placeId?: string;
  };
};

type NamedGbpAccountResponse = NonNullable<
  GbpAccountsResponse["accounts"]
>[number] & {
  name: string;
};

type NamedGbpLocationResponse = GbpLocationResponse & {
  name: string;
};

export class GoogleBusinessProfileApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody = "",
  ) {
    super(message);
    this.name = "GoogleBusinessProfileApiError";
  }
}

export type GoogleTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
};

export type GbpAccount = {
  name: string;
  accountName: string;
  type: string;
};

export type GbpLocation = {
  accountName: string;
  accountDisplayName: string;
  name: string;
  title: string;
  storeCode: string;
  locationId: string;
  address: string;
  placeId: string;
};

function normalizeEnv(value: string | undefined) {
  return value?.trim() || "";
}

function getRequiredEnv(name: string) {
  const value = normalizeEnv(process.env[name]);

  if (!value) {
    throw new Error(`${name} が設定されていません。`);
  }

  return value;
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/$/, "");
}

export function getGoogleRedirectUri(requestUrl?: string, forwardedOrigin?: string) {
  const configuredRedirectUri = normalizeEnv(process.env.GOOGLE_REDIRECT_URI);

  if (configuredRedirectUri) {
    return configuredRedirectUri;
  }

  const configuredBaseUrl =
    normalizeEnv(process.env.NEXT_PUBLIC_APP_URL) ||
    normalizeEnv(process.env.NEXT_PUBLIC_SITE_URL) ||
    normalizeEnv(process.env.NGROK_URL);

  if (configuredBaseUrl) {
    return `${trimTrailingSlash(configuredBaseUrl)}/api/auth/callback/google`;
  }

  if (forwardedOrigin) {
    return `${trimTrailingSlash(forwardedOrigin)}/api/auth/callback/google`;
  }

  if (requestUrl) {
    return `${new URL(requestUrl).origin}/api/auth/callback/google`;
  }

  throw new Error("Google OAuth のリダイレクトURLを解決できません。");
}

export function getForwardedOrigin(headers: Headers) {
  const forwardedHost = headers.get("x-forwarded-host");

  if (!forwardedHost) {
    return undefined;
  }

  const forwardedProto = headers.get("x-forwarded-proto") || "https";
  return `${forwardedProto}://${forwardedHost}`;
}

export function buildGoogleOAuthUrl(config: GoogleOAuthConfig = {}) {
  const clientId = config.clientId?.trim() || getRequiredEnv("GOOGLE_CLIENT_ID");
  const redirectUri = config.redirectUri || getGoogleRedirectUri();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set(
    "scope",
    [...GOOGLE_PROFILE_SCOPES, GOOGLE_BUSINESS_SCOPE].join(" "),
  );
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");

  if (config.state) {
    url.searchParams.set("state", config.state);
  }

  return url.toString();
}

function toTokenSet(data: GoogleTokenResponse, previousRefreshToken = ""): GoogleTokenSet {
  const accessToken = data.access_token?.trim() || "";
  const refreshToken = data.refresh_token?.trim() || previousRefreshToken.trim();

  if (!accessToken) {
    throw new Error("Google OAuth のアクセストークンを取得できませんでした。");
  }

  if (!refreshToken) {
    throw new Error(
      "Google OAuth のRefresh Tokenを取得できませんでした。Google側の権限を解除してから再連携してください。",
    );
  }

  return {
    accessToken,
    refreshToken,
    expiresIn: data.expires_in || 0,
    scope: data.scope || "",
    tokenType: data.token_type || "Bearer",
  };
}

export async function exchangeGoogleCode({
  code,
  redirectUri,
  previousRefreshToken,
  fetchImpl = fetch,
}: {
  code: string;
  redirectUri: string;
  previousRefreshToken?: string;
  fetchImpl?: FetchLike;
}) {
  const body = new URLSearchParams({
    code,
    client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed: ${response.status}`);
  }

  return toTokenSet(
    (await response.json()) as GoogleTokenResponse,
    previousRefreshToken,
  );
}

export async function refreshGoogleAccessToken({
  refreshToken,
  fetchImpl = fetch,
}: {
  refreshToken: string;
  fetchImpl?: FetchLike;
}) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: getRequiredEnv("GOOGLE_CLIENT_ID"),
    client_secret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    grant_type: "refresh_token",
  });

  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Google OAuth refresh failed: ${response.status}`);
  }

  const data = (await response.json()) as GoogleTokenResponse;
  const accessToken = data.access_token?.trim() || "";

  if (!accessToken) {
    throw new Error("Google OAuth のアクセストークンを更新できませんでした。");
  }

  return accessToken;
}

export async function fetchGoogleAccountEmail({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: FetchLike;
}) {
  const url = new URL("https://www.googleapis.com/oauth2/v3/tokeninfo");
  url.searchParams.set("access_token", accessToken);
  const response = await fetchImpl(url.toString());

  if (!response.ok) {
    return "";
  }

  const data = (await response.json()) as GoogleTokenInfoResponse;
  return data.email?.trim() || "";
}

function getLocationId(name: string) {
  return name.split("/").filter(Boolean).at(-1) || name;
}

function formatAddress(location: GbpLocationResponse) {
  const address = location.storefrontAddress;

  if (!address) {
    return "";
  }

  return [
    address.postalCode,
    address.administrativeArea,
    address.locality,
    ...(address.addressLines || []),
  ]
    .filter(Boolean)
    .join(" ");
}

function hasName<T extends { name?: string }>(record: T): record is T & { name: string } {
  return Boolean(record.name?.trim());
}

function toArray<T>(value: T[] | undefined) {
  return Array.isArray(value) ? value : [];
}

async function readResponseText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

async function fetchGbpJson<T>(url: URL, accessToken: string, fetchImpl: FetchLike) {
  const response = await fetchImpl(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const responseBody = await readResponseText(response);

    throw new GoogleBusinessProfileApiError(
      `Google Business Profile API failed: ${response.status}`,
      response.status,
      responseBody,
    );
  }

  return (await response.json()) as T;
}

export async function fetchGbpAccounts({
  accessToken,
  fetchImpl = fetch,
}: {
  accessToken: string;
  fetchImpl?: FetchLike;
}) {
  const accounts: GbpAccount[] = [];
  let pageToken = "";

  do {
    const url = new URL(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
    );

    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const data = await fetchGbpJson<GbpAccountsResponse>(
      url,
      accessToken,
      fetchImpl,
    );
    accounts.push(
      ...toArray(data?.accounts)
        .filter(hasName)
        .map((account) => ({
          name: (account as NamedGbpAccountResponse).name,
          accountName: account.accountName || account.name,
          type: account.type || "",
        })),
    );
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return accounts;
}

export async function fetchGbpLocationsForAccounts({
  accessToken,
  accounts,
  fetchImpl = fetch,
}: {
  accessToken: string;
  accounts: GbpAccount[];
  fetchImpl?: FetchLike;
}) {
  const locations: GbpLocation[] = [];

  for (const account of accounts) {
    let pageToken = "";

    do {
      const url = new URL(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`,
      );
      url.searchParams.set(
        "readMask",
        "name,title,storeCode,storefrontAddress,metadata",
      );

      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      try {
        const data = await fetchGbpJson<GbpLocationsResponse>(
          url,
          accessToken,
          fetchImpl,
        );
        locations.push(
          ...toArray(data?.locations)
            .filter(hasName)
            .map((location) => ({
              accountName: account.name,
              accountDisplayName: account.accountName,
              name: (location as NamedGbpLocationResponse).name,
              title: location.title || getLocationId(location.name),
              storeCode: location.storeCode || "",
              locationId: getLocationId(location.name),
              address: formatAddress(location),
              placeId: location.metadata?.placeId || "",
            })),
        );
        pageToken = data.nextPageToken || "";
      } catch (error) {
        console.error(
          `Failed to fetch locations for ${account.name}:`,
          error instanceof GoogleBusinessProfileApiError
            ? `${error.message}${error.responseBody ? ` ${error.responseBody}` : ""}`
            : error instanceof Error
              ? error.message
              : error,
        );
        pageToken = "";
      }
    } while (pageToken);
  }

  return locations;
}
