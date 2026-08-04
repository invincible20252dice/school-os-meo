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

  it("starts Google OAuth with the shared auth callback URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://school-os-meo.vercel.app";
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });

    await expect(
      startGoogleOAuth({
        auth: { signInWithOAuth },
      }),
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
      }),
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
