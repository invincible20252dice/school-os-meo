import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildInstagramOAuthUrl,
  exchangeInstagramCode,
  fetchInstagramBusinessAccountId,
  getForwardedOrigin,
  getInstagramRedirectUri,
  toSecureBaseUrl,
} from "./instagram-oauth";

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("instagram-oauth", () => {
  it("converts HTTP base URLs to HTTPS", () => {
    expect(toSecureBaseUrl("http://example.ngrok-free.dev/")).toBe(
      "https://example.ngrok-free.dev",
    );
    expect(toSecureBaseUrl("   ")).toBe("");
    expect(toSecureBaseUrl("https://example.ngrok-free.dev")).toBe(
      "https://example.ngrok-free.dev",
    );
  });

  it("builds redirect uri from the request origin", () => {
    expect(getInstagramRedirectUri("https://example.ngrok-free.dev/api/auth/instagram")).toBe(
      "https://example.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("uses the default ngrok URL when no redirect source is configured", () => {
    process.env = {
      ...process.env,
      INSTAGRAM_REDIRECT_URI: "",
      NGROK_URL: "",
      NEXT_PUBLIC_APP_URL: "",
    };

    expect(getInstagramRedirectUri()).toBe(
      "https://buffing-sedate-doormat.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("ignores malformed local-origin checks and still builds a secure redirect base", () => {
    expect(getInstagramRedirectUri(undefined, "not a valid url")).toBe(
      "not a valid url/api/auth/callback/instagram",
    );
  });

  it("does not send local HTTP redirect uri to Meta", () => {
    expect(getInstagramRedirectUri("http://127.0.0.1:3030/api/auth/instagram")).toBe(
      "https://buffing-sedate-doormat.ngrok-free.dev/api/auth/callback/instagram",
    );
    expect(getInstagramRedirectUri("http://localhost:3030/api/auth/instagram")).toBe(
      "https://buffing-sedate-doormat.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("does not send local forwarded origin redirect uri to Meta", () => {
    expect(
      getInstagramRedirectUri(
        "http://127.0.0.1:3030/api/auth/instagram",
        "http://127.0.0.1:3030",
      ),
    ).toBe(
      "https://buffing-sedate-doormat.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("uses NGROK_URL before the request origin", () => {
    process.env = {
      ...process.env,
      NGROK_URL: "http://configured.ngrok-free.dev",
      NEXT_PUBLIC_APP_URL: "",
    };

    expect(getInstagramRedirectUri("http://127.0.0.1:3030/api/auth/instagram")).toBe(
      "https://configured.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("uses NEXT_PUBLIC_APP_URL as a secure redirect uri base", () => {
    process.env = {
      ...process.env,
      NGROK_URL: "",
      NEXT_PUBLIC_APP_URL: "http://public.example.com",
    };

    expect(getInstagramRedirectUri("http://127.0.0.1:3030/api/auth/instagram")).toBe(
      "https://public.example.com/api/auth/callback/instagram",
    );
  });

  it("keeps explicit redirect uri secure", () => {
    process.env = {
      ...process.env,
      INSTAGRAM_REDIRECT_URI:
        "http://configured.ngrok-free.dev/api/auth/callback/instagram",
      NGROK_URL: "",
      NEXT_PUBLIC_APP_URL: "",
    };

    expect(getInstagramRedirectUri("http://127.0.0.1:3030/api/auth/instagram")).toBe(
      "https://configured.ngrok-free.dev/api/auth/callback/instagram",
    );
  });

  it("builds redirect uri from forwarded origin before request origin", () => {
    expect(
      getInstagramRedirectUri(
        "https://localhost:3021/api/auth/instagram",
        "https://example.ngrok-free.dev",
      ),
    ).toBe("https://example.ngrok-free.dev/api/auth/callback/instagram");
  });

  it("builds forwarded origin from proxy headers", () => {
    const headers = new Headers({
      "x-forwarded-host": "example.ngrok-free.dev",
      "x-forwarded-proto": "https",
    });

    expect(getForwardedOrigin(headers)).toBe("https://example.ngrok-free.dev");
  });

  it("returns no forwarded origin without forwarded host and defaults proto to HTTPS", () => {
    expect(getForwardedOrigin(new Headers())).toBeUndefined();
    expect(
      getForwardedOrigin(
        new Headers({
          "x-forwarded-host": "example.ngrok-free.dev",
        }),
      ),
    ).toBe("https://example.ngrok-free.dev");
  });

  it("builds Meta OAuth URL", () => {
    const url = new URL(
      buildInstagramOAuthUrl({
        metaAppId: "meta-app-id",
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
        state: "school-demo-001",
      }),
    );

    expect(url.origin + url.pathname).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("meta-app-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.ngrok-free.dev/api/auth/callback/instagram",
    );
    expect(url.searchParams.get("scope")).toContain("instagram_basic");
    expect(url.searchParams.get("state")).toBe("school-demo-001");
  });

  it("uses the fixed Meta App ID fallback when app id is not configured", () => {
    process.env = { ...process.env, META_APP_ID: "" };
    const url = new URL(
      buildInstagramOAuthUrl({
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
        state: "school-demo-001",
      }),
    );

    expect(url.searchParams.get("client_id")).toBe("4340844179393244");
  });

  it("uses env Meta App ID and omits state when not provided", () => {
    process.env = { ...process.env, META_APP_ID: "env-meta-app-id" };
    const url = new URL(
      buildInstagramOAuthUrl({
        metaAppId: " ",
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
      }),
    );

    expect(url.searchParams.get("client_id")).toBe("env-meta-app-id");
    expect(url.searchParams.has("state")).toBe(false);
  });

  it("exchanges an OAuth code for an access token", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: "instagram-access-token" }),
    );

    await expect(
      exchangeInstagramCode({
        code: "oauth-code",
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
        metaAppId: "meta-app-id",
        metaAppSecret: "meta-secret",
        fetchImpl: fetchMock,
      }),
    ).resolves.toBe("instagram-access-token");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses the fixed Meta App ID when exchanging a code without configured app id", async () => {
    process.env = { ...process.env, META_APP_ID: "" };
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: "instagram-access-token" }),
    );

    await exchangeInstagramCode({
      code: "oauth-code",
      redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
      metaAppSecret: "meta-secret",
      fetchImpl: fetchMock,
    });

    const tokenUrl = new URL(vi.mocked(fetchMock).mock.calls[0][0] as string);
    expect(tokenUrl.searchParams.get("client_id")).toBe("4340844179393244");
  });

  it("uses the hardcoded Meta App Secret fallback when exchanging a code", async () => {
    process.env = { ...process.env, META_APP_ID: "", META_APP_SECRET: "" };
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: "instagram-access-token" }),
    );

    await exchangeInstagramCode({
        code: "oauth-code",
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
        metaAppId: "",
        metaAppSecret: "",
      fetchImpl: fetchMock,
    });

    const tokenUrl = new URL(vi.mocked(fetchMock).mock.calls[0][0] as string);
    expect(tokenUrl.searchParams.get("client_id")).toBe("4340844179393244");
    expect(tokenUrl.searchParams.get("client_secret")).toBe(
      "REPLACE_WITH_META_APP_SECRET",
    );
  });

  it("uses NEXT_PUBLIC_META_APP_SECRET when exchanging a code without server secret", async () => {
    process.env = {
      ...process.env,
      META_APP_ID: "",
      META_APP_SECRET: "",
      NEXT_PUBLIC_META_APP_SECRET: "public-env-secret",
    };
    const fetchMock = vi.fn(async () =>
      Response.json({ access_token: "instagram-access-token" }),
    );

    await exchangeInstagramCode({
      code: "oauth-code",
      redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
      fetchImpl: fetchMock,
    });

    const tokenUrl = new URL(vi.mocked(fetchMock).mock.calls[0][0] as string);
    expect(tokenUrl.searchParams.get("client_secret")).toBe("public-env-secret");
  });

  it("throws when Meta rejects OAuth code exchange", async () => {
    await expect(
      exchangeInstagramCode({
        code: "oauth-code",
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
        metaAppId: "meta-app-id",
        metaAppSecret: "meta-secret",
        fetchImpl: vi.fn(async () => new Response("{}", { status: 400 })),
      }),
    ).rejects.toThrow("Instagram OAuth token exchange failed: 400");
  });

  it("throws when OAuth token response does not include an access token", async () => {
    await expect(
      exchangeInstagramCode({
        code: "oauth-code",
        redirectUri: "https://example.ngrok-free.dev/api/auth/callback/instagram",
        metaAppId: "meta-app-id",
        metaAppSecret: "meta-secret",
        fetchImpl: vi.fn(async () => Response.json({})),
      }),
    ).rejects.toThrow("Instagram OAuth response did not include access_token.");
  });

  it("fetches Instagram Business Account ID from Meta pages", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            instagram_business_account: {
              id: "ig-business-id",
            },
          },
        ],
      }),
    );

    await expect(
      fetchInstagramBusinessAccountId({
        accessToken: "instagram-access-token",
        fetchImpl: fetchMock,
      }),
    ).resolves.toBe("ig-business-id");
  });

  it("skips pages without Instagram Business Account IDs", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {},
          {
            instagram_business_account: {
              id: "ig-business-id",
            },
          },
        ],
      }),
    );

    await expect(
      fetchInstagramBusinessAccountId({
        accessToken: "instagram-access-token",
        fetchImpl: fetchMock,
      }),
    ).resolves.toBe("ig-business-id");
  });

  it("throws when Meta rejects the business account request", async () => {
    await expect(
      fetchInstagramBusinessAccountId({
        accessToken: "instagram-access-token",
        fetchImpl: vi.fn(async () => new Response("{}", { status: 403 })),
      }),
    ).rejects.toThrow("Instagram business account fetch failed: 403");
  });

  it("throws when Instagram Business Account ID is not found", async () => {
    await expect(
      fetchInstagramBusinessAccountId({
        accessToken: "instagram-access-token",
        fetchImpl: vi.fn(async () => Response.json({ data: [{}] })),
      }),
    ).rejects.toThrow("Instagram business account was not found.");
  });
});
