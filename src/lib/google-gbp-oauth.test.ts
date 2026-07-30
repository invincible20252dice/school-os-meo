import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleOAuthUrl,
  exchangeGoogleCode,
  fetchGbpAccounts,
  fetchGbpLocationsForAccounts,
  fetchGoogleAccountEmail,
  getForwardedOrigin,
  getGoogleRedirectUri,
  GOOGLE_BUSINESS_SCOPE,
  refreshGoogleAccessToken,
} from "./google-gbp-oauth";

const originalEnv = process.env;

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status || 200,
    headers: { "content-type": "application/json" },
  });
}

describe("google-gbp-oauth", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
      GOOGLE_REDIRECT_URI: "",
      NEXT_PUBLIC_APP_URL: "",
      NEXT_PUBLIC_SITE_URL: "",
      NGROK_URL: "",
    };
  });

  it("builds a Google OAuth URL with GBP scope and offline consent", () => {
    const url = new URL(
      buildGoogleOAuthUrl({
        redirectUri: "https://app.example.com/api/auth/callback/google",
        state: "school-1",
      }),
    );

    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("scope")).toContain(GOOGLE_BUSINESS_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("state")).toBe("school-1");
  });

  it("uses explicit client id and throws when no redirect source exists", () => {
    const url = new URL(
      buildGoogleOAuthUrl({
        clientId: "explicit-client-id",
        redirectUri: "https://app.example.com/api/auth/callback/google",
      }),
    );

    expect(url.searchParams.get("client_id")).toBe("explicit-client-id");
    expect(url.searchParams.has("state")).toBe(false);

    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "";
    process.env.NGROK_URL = "";
    process.env.GOOGLE_REDIRECT_URI = "";

    expect(() => getGoogleRedirectUri()).toThrow("リダイレクトURL");
  });

  it("builds OAuth URL from environment defaults", () => {
    process.env.GOOGLE_REDIRECT_URI =
      "https://app.example.com/api/auth/callback/google";

    const url = new URL(buildGoogleOAuthUrl());

    expect(url.searchParams.get("client_id")).toBe("google-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/api/auth/callback/google",
    );
  });

  it("resolves redirect URI from explicit env, app URL, forwarded host, and request URL", () => {
    process.env.GOOGLE_REDIRECT_URI =
      "https://oauth.example.com/api/auth/callback/google";
    expect(getGoogleRedirectUri("https://ignored.example.com")).toBe(
      "https://oauth.example.com/api/auth/callback/google",
    );

    process.env.GOOGLE_REDIRECT_URI = "";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(getGoogleRedirectUri("https://ignored.example.com")).toBe(
      "https://app.example.com/api/auth/callback/google",
    );

    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "https://site.example.com/";
    expect(getGoogleRedirectUri("https://ignored.example.com")).toBe(
      "https://site.example.com/api/auth/callback/google",
    );

    process.env.NEXT_PUBLIC_SITE_URL = "";
    process.env.NGROK_URL = "https://ngrok.example.com/";
    expect(getGoogleRedirectUri("https://ignored.example.com")).toBe(
      "https://ngrok.example.com/api/auth/callback/google",
    );

    process.env.NGROK_URL = "";
    expect(
      getGoogleRedirectUri(
        "https://ignored.example.com",
        "https://forwarded.example.com",
      ),
    ).toBe("https://forwarded.example.com/api/auth/callback/google");

    expect(getGoogleRedirectUri("https://request.example.com/path")).toBe(
      "https://request.example.com/api/auth/callback/google",
    );
  });

  it("reads forwarded origin headers", () => {
    const headers = new Headers({
      "x-forwarded-host": "example.ngrok-free.dev",
      "x-forwarded-proto": "https",
    });

    expect(getForwardedOrigin(headers)).toBe(
      "https://example.ngrok-free.dev",
    );
    expect(
      getForwardedOrigin(
        new Headers({ "x-forwarded-host": "default-proto.example.com" }),
      ),
    ).toBe("https://default-proto.example.com");
    expect(getForwardedOrigin(new Headers())).toBeUndefined();
  });

  it("exchanges authorization code and keeps previous refresh token when Google omits it", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        access_token: "access-token",
        expires_in: 3600,
        token_type: "Bearer",
      }),
    ) as unknown as typeof fetch;

    const tokenSet = await exchangeGoogleCode({
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/auth/callback/google",
      previousRefreshToken: "saved-refresh-token",
      fetchImpl,
    });

    expect(tokenSet).toMatchObject({
      accessToken: "access-token",
      refreshToken: "saved-refresh-token",
      expiresIn: 3600,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" }),
    );

    const tokenSetWithRefreshToken = await exchangeGoogleCode({
      code: "oauth-code",
      redirectUri: "https://app.example.com/api/auth/callback/google",
      fetchImpl: vi.fn(async () =>
        jsonResponse({
          access_token: "access-token",
          refresh_token: "new-refresh-token",
        }),
      ) as unknown as typeof fetch,
    });
    expect(tokenSetWithRefreshToken).toMatchObject({
      refreshToken: "new-refresh-token",
      expiresIn: 0,
      scope: "",
      tokenType: "Bearer",
    });
  });

  it("throws when token exchange fails or refresh token is unavailable", async () => {
    await expect(
      exchangeGoogleCode({
        code: "bad-code",
        redirectUri: "https://app.example.com/api/auth/callback/google",
        fetchImpl: vi.fn(async () => jsonResponse({}, { status: 400 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("Google OAuth token exchange failed");

    await expect(
      exchangeGoogleCode({
        code: "oauth-code",
        redirectUri: "https://app.example.com/api/auth/callback/google",
        fetchImpl: vi.fn(async () =>
          jsonResponse({ access_token: "access-token" }),
        ) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("Refresh Token");

    await expect(
      exchangeGoogleCode({
        code: "oauth-code",
        redirectUri: "https://app.example.com/api/auth/callback/google",
        previousRefreshToken: "refresh-token",
        fetchImpl: vi.fn(async () => jsonResponse({})) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("アクセストークン");
  });

  it("refreshes access token", async () => {
    const accessToken = await refreshGoogleAccessToken({
      refreshToken: "refresh-token",
      fetchImpl: vi.fn(async () =>
        jsonResponse({ access_token: "new-access-token" }),
      ) as unknown as typeof fetch,
    });

    expect(accessToken).toBe("new-access-token");

    await expect(
      refreshGoogleAccessToken({
        refreshToken: "refresh-token",
        fetchImpl: vi.fn(async () => jsonResponse({}, { status: 401 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("refresh failed");

    await expect(
      refreshGoogleAccessToken({
        refreshToken: "refresh-token",
        fetchImpl: vi.fn(async () => jsonResponse({})) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("更新できません");
  });

  it("returns an empty email when tokeninfo cannot be read", async () => {
    const successEmail = await fetchGoogleAccountEmail({
      accessToken: "access-token",
      fetchImpl: vi.fn(async () =>
        jsonResponse({ email: " owner@example.com " }),
      ) as unknown as typeof fetch,
    });
    expect(successEmail).toBe("owner@example.com");

    const noEmail = await fetchGoogleAccountEmail({
      accessToken: "access-token",
      fetchImpl: vi.fn(async () => jsonResponse({})) as unknown as typeof fetch,
    });
    expect(noEmail).toBe("");

    const email = await fetchGoogleAccountEmail({
      accessToken: "access-token",
      fetchImpl: vi.fn(async () => jsonResponse({}, { status: 403 })) as unknown as typeof fetch,
    });

    expect(email).toBe("");
  });

  it("fetches paginated GBP accounts and locations", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [{ name: "accounts/1", accountName: "塾MEO" }],
          nextPageToken: "next",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          accounts: [{ name: "accounts/2", type: "PERSONAL" }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          locations: [
            {
              name: "locations/100",
              title: "iスクール 本校",
              storefrontAddress: {
                postalCode: "100-0001",
                administrativeArea: "東京都",
                locality: "千代田区",
                addressLines: ["丸の内1-1-1"],
              },
              metadata: { placeId: "place-100" },
            },
          ],
          nextPageToken: "next-location-page",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          locations: [
            {
              name: "locations/101",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ locations: [] })) as unknown as typeof fetch;

    const accounts = await fetchGbpAccounts({
      accessToken: "access-token",
      fetchImpl,
    });
    const locations = await fetchGbpLocationsForAccounts({
      accessToken: "access-token",
      accounts,
      fetchImpl,
    });

    expect(accounts).toEqual([
      { name: "accounts/1", accountName: "塾MEO", type: "" },
      { name: "accounts/2", accountName: "accounts/2", type: "PERSONAL" },
    ]);
    expect(locations[0]).toMatchObject({
      accountName: "accounts/1",
      title: "iスクール 本校",
      locationId: "100",
      address: "100-0001 東京都 千代田区 丸の内1-1-1",
      placeId: "place-100",
    });
    expect(locations[1]).toMatchObject({
      title: "101",
      address: "",
      placeId: "",
    });
  });

  it("throws when GBP API returns an error", async () => {
    await expect(
      fetchGbpAccounts({
        accessToken: "access-token",
        fetchImpl: vi.fn(async () => jsonResponse({}, { status: 500 })) as unknown as typeof fetch,
      }),
    ).rejects.toThrow("Google Business Profile API failed");
  });

  it("handles empty GBP pages and sparse location addresses", async () => {
    const accountsFetch = vi.fn(async () => jsonResponse({})) as unknown as typeof fetch;
    const accounts = await fetchGbpAccounts({
      accessToken: "access-token",
      fetchImpl: accountsFetch,
    });
    expect(accounts).toEqual([]);

    const locationsFetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(
        jsonResponse({
          locations: [
            {
              name: "/",
              storefrontAddress: {
                administrativeArea: "東京都",
              },
            },
          ],
        }),
      ) as unknown as typeof fetch;

    expect(
      await fetchGbpLocationsForAccounts({
        accessToken: "access-token",
        accounts: [
          { name: "accounts/1", accountName: "塾MEO", type: "" },
          { name: "accounts/2", accountName: "iスクール", type: "" },
        ],
        fetchImpl: locationsFetch,
      }),
    ).toEqual([
      {
        accountName: "accounts/2",
        accountDisplayName: "iスクール",
        name: "/",
        title: "/",
        locationId: "/",
        address: "東京都",
        placeId: "",
      },
    ]);
  });
});
