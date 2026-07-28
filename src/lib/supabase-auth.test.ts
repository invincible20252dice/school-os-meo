import { afterEach, describe, expect, it, vi } from "vitest";
import {
  exchangeMagicLinkCode,
  getAuthCallbackUrl,
  requestMagicLinkEmail,
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
        auth: { exchangeCodeForSession },
      }),
    ).resolves.toBeUndefined();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
  });

  it("surfaces missing code and exchange errors", async () => {
    await expect(
      exchangeMagicLinkCode("", {
        auth: { exchangeCodeForSession: vi.fn() },
      }),
    ).rejects.toThrow("認証コードが見つかりません。");

    await expect(
      exchangeMagicLinkCode("bad-code", {
        auth: {
          exchangeCodeForSession: vi
            .fn()
            .mockResolvedValue({ error: { message: "Invalid login link." } }),
        },
      }),
    ).rejects.toThrow("Invalid login link.");
  });
});
