import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exchangeSupabaseAuthCallback,
  exchangeMagicLinkCode,
  getAuthCallbackUrl,
  requestMagicLinkEmail,
  startGoogleOAuth,
} from "./supabase-auth";

const originalEnv = process.env;

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe("supabase auth", () => {
  it("builds the callback URL from NEXT_PUBLIC_APP_URL", () => {
    expect(getAuthCallbackUrl("https://school-os-meo.vercel.app/")).toBe(
      "https://school-os-meo.vercel.app/auth/callback",
    );
  });

  it("uses the browser origin when NEXT_PUBLIC_APP_URL is not configured", () => {
    expect(getAuthCallbackUrl("", "http://localhost:3031")).toBe(
      "http://localhost:3031/auth/callback",
    );
  });

  it("fails when no app URL can be resolved", () => {
    expect(() => getAuthCallbackUrl("", "")).toThrow(
      "NEXT_PUBLIC_APP_URL or NEXT_PUBLIC_SITE_URL is not configured.",
    );
  });

  it("can use NEXT_PUBLIC_SITE_URL when the app URL is absent", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "https://site-url.example.com";
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });

    await requestMagicLinkEmail("owner@example.com", {
      auth: { signInWithOtp },
    });

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: {
        emailRedirectTo: "https://site-url.example.com/auth/callback",
      },
    });
  });

  it("requests a Supabase magic link with the normalized email and redirect URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://school-os-meo.vercel.app";
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });

    await expect(
      requestMagicLinkEmail(" owner@example.com ", {
        auth: { signInWithOtp },
      }),
    ).resolves.toEqual({
      email: "owner@example.com",
      emailRedirectTo: "https://school-os-meo.vercel.app/auth/callback",
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.com",
      options: {
        emailRedirectTo: "https://school-os-meo.vercel.app/auth/callback",
      },
    });
  });

  it("starts Google OAuth with the browser callback URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://school-os-meo.vercel.app";
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

    await expect(
      startGoogleOAuth({
        auth: { signInWithOAuth },
      }, "https://school-os-meo.vercel.app"),
    ).resolves.toEqual({
      redirectTo: "https://school-os-meo.vercel.app/auth/callback",
    });
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://school-os-meo.vercel.app/auth/callback",
        scopes: "https://www.googleapis.com/auth/business.manage",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
  });

  it("requests Google OAuth refresh token consent for GBP access", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "";
    process.env.NEXT_PUBLIC_SITE_URL = "";
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

    vi.stubEnv("NODE_ENV", "development");
    await startGoogleOAuth(
      {
        auth: { signInWithOAuth },
      },
      "http://localhost:3030",
    );

    const payload = signInWithOAuth.mock.calls[0][0];
    expect(payload.options).toMatchObject({
      redirectTo: "http://localhost:3030/auth/callback",
      scopes: "https://www.googleapis.com/auth/business.manage",
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    });
  });

  it("surfaces Google OAuth start errors", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://school-os-meo.vercel.app";

    await expect(
      startGoogleOAuth({
        auth: {
          signInWithOAuth: vi
            .fn()
            .mockResolvedValue({ error: { message: "Google provider disabled." } }),
        },
      }, "https://school-os-meo.vercel.app"),
    ).rejects.toThrow("Google provider disabled.");
  });

  it("surfaces validation and Supabase send errors", async () => {
    await expect(
      requestMagicLinkEmail(" ", {
        auth: { signInWithOtp: vi.fn() },
      }),
    ).rejects.toThrow("メールアドレスを入力してください。");

    process.env.NEXT_PUBLIC_APP_URL = "https://school-os-meo.vercel.app";
    await expect(
      requestMagicLinkEmail("owner@example.com", {
        auth: {
          signInWithOtp: vi
            .fn()
            .mockResolvedValue({ error: { message: "SMTP is not configured." } }),
        },
      }),
    ).rejects.toThrow("SMTP is not configured.");
  });

  it("exchanges the callback code for a Supabase session", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });

    await expect(
      exchangeMagicLinkCode(" auth-code ", {
        auth: {
          exchangeCodeForSession,
          setSession: vi.fn(),
          verifyOtp: vi.fn(),
        },
      }),
    ).resolves.toBeUndefined();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
  });

  it("surfaces missing code and exchange errors", async () => {
    await expect(
      exchangeMagicLinkCode("", {
        auth: {
          exchangeCodeForSession: vi.fn(),
          setSession: vi.fn(),
          verifyOtp: vi.fn(),
        },
      }),
    ).rejects.toThrow("認証コードが見つかりません。");

    await expect(
      exchangeMagicLinkCode("bad-code", {
        auth: {
          exchangeCodeForSession: vi
            .fn()
            .mockResolvedValue({ error: { message: "Invalid login link." } }),
          setSession: vi.fn(),
          verifyOtp: vi.fn(),
        },
      }),
    ).rejects.toThrow("Invalid login link.");
  });

  it("handles a PKCE callback code from the query string", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({ error: null });

    await exchangeSupabaseAuthCallback(
      { search: "?code=auth-code", hash: "" },
      {
        auth: {
          exchangeCodeForSession,
          setSession: vi.fn(),
          verifyOtp: vi.fn(),
        },
      },
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
  });

  it("verifies token_hash callbacks from Supabase email confirmation links", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });

    await exchangeSupabaseAuthCallback(
      { search: "?token_hash=hash-value&type=email", hash: "" },
      {
        auth: {
          exchangeCodeForSession: vi.fn(),
          setSession: vi.fn(),
          verifyOtp,
        },
      },
    );

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-value",
      type: "email",
    });
  });

  it("surfaces token_hash verification errors", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      error: { message: "Token hash expired." },
    });

    await expect(
      exchangeSupabaseAuthCallback(
        { search: "?token_hash=hash-value&type=invite", hash: "" },
        {
          auth: {
            exchangeCodeForSession: vi.fn(),
            setSession: vi.fn(),
            verifyOtp,
          },
        },
      ),
    ).rejects.toThrow("Token hash expired.");
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-value",
      type: "invite",
    });
  });

  it("sets the session from hash access and refresh tokens", async () => {
    const setSession = vi.fn().mockResolvedValue({ error: null });

    await exchangeSupabaseAuthCallback(
      {
        search: "",
        hash: "#access_token=access-token&refresh_token=refresh-token",
      },
      {
        auth: {
          exchangeCodeForSession: vi.fn(),
          setSession,
          verifyOtp: vi.fn(),
        },
      },
    );

    expect(setSession).toHaveBeenCalledWith({
      access_token: "access-token",
      refresh_token: "refresh-token",
    });
  });

  it("surfaces hash session setup errors", async () => {
    const setSession = vi.fn().mockResolvedValue({
      error: { message: "Refresh token revoked." },
    });

    await expect(
      exchangeSupabaseAuthCallback(
        {
          search: "",
          hash: "#access_token=access-token&refresh_token=refresh-token",
        },
        {
          auth: {
            exchangeCodeForSession: vi.fn(),
            setSession,
            verifyOtp: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("Refresh token revoked.");
  });

  it("surfaces callback provider errors and missing token errors", async () => {
    await expect(
      exchangeSupabaseAuthCallback(
        { search: "?error_description=Email+link+expired", hash: "" },
        {
          auth: {
            exchangeCodeForSession: vi.fn(),
            setSession: vi.fn(),
            verifyOtp: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("Email link expired");

    await expect(
      exchangeSupabaseAuthCallback(
        { search: "", hash: "" },
        {
          auth: {
            exchangeCodeForSession: vi.fn(),
            setSession: vi.fn(),
            verifyOtp: vi.fn(),
          },
        },
      ),
    ).rejects.toThrow("認証トークンが見つかりません。");
  });
});


describe("Google OAuth origin boundary", () => {
  const origins = [
    "https://staging.jukumeo.com",
    "https://app.jukumeo.com",
    "https://school-os-meo.vercel.app",
  ];
  it.each(origins)("uses exact browser origin %s despite stale public configuration", async (origin) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://school-os-meo.vercel.app");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://external.example");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_URL", "external.example");
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, origin))
      .resolves.toEqual({ redirectTo: `${origin}/auth/callback` });
    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/business.manage",
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  });
  it.each([
    undefined, "", "null", "https://external.example", "//app.jukumeo.com",
    "http://app.jukumeo.com", "https://app.jukumeo.com.evil.example",
    "https://evil-app.jukumeo.com", "https://app.jukumeo.com:443",
    "https://app.jukumeo.com:444", "https://app.jukumeo.com/",
    "https://app.jukumeo.com/auth/callback", "https://app.jukumeo.com?next=https://evil.example",
    "https://app.jukumeo.com#evil", "https://user@app.jukumeo.com",
    "https://app.jukumeo.com@evil.example", " https://app.jukumeo.com",
    "https://app.jukumeo.com\n", "https://APP.jukumeo.com", "https://app.jukumeo.com.",
    "http://localhost:3030", "http://localhost:3031", "http://127.0.0.1:3030",
  ])("rejects production input %s before calling SDK even with valid env fallback", async (origin) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.jukumeo.com");
    const signInWithOAuth = vi.fn();
    await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, origin)).rejects.toThrow();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:3030", "http://localhost:3031", "http://127.0.0.1:3030"])("preserves explicit development origin %s", async (origin) => {
    vi.stubEnv("NODE_ENV", "development");
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, origin))
      .resolves.toEqual({ redirectTo: `${origin}/auth/callback` });
  });
  it.each(["http://localhost:9999", "http://127.0.0.1:4317", "http://localhost:3030/", "http://localhost:3030?next=x", "http://localhost.evil:3030"])("rejects unlisted development origin %s", async (origin) => {
    vi.stubEnv("NODE_ENV", "development");
    const signInWithOAuth = vi.fn();
    await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, origin)).rejects.toThrow();
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });
});
