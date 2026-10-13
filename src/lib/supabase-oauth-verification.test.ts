import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { parseGoogleOAuthVerification, startGoogleOAuth, type GoogleOAuthVerification } from "./supabase-auth";

const origin = "https://app.jukumeo.com";
const normalRequest = {
  provider: "google",
  options: {
    redirectTo: `${origin}/auth/callback`,
    scopes: "https://www.googleapis.com/auth/business.manage",
    queryParams: { access_type: "offline", prompt: "consent" },
  },
};
const accounts = [
  ["admin", "invincible.20.252.dice@gmail.com"],
  ["general", "ischooljunior.company@gmail.com"],
] as const;

describe("verification-only Google account hints", () => {
  it.each([
    "", "?account_type=admin", "?account_type=arbitrary@example.invalid",
    "?login_hint=arbitrary@example.invalid&email=arbitrary@example.invalid",
    "?auth_verification=0&account_type=general", "?auth_verification=0&account_type=unknown",
  ])("keeps the exact existing normal OAuth request for %s", async search => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const verification = parseGoogleOAuthVerification(search);
    expect(verification).toEqual({ enabled: false });
    await startGoogleOAuth({ auth: { signInWithOAuth } }, origin, verification);
    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith(normalRequest);
  });

  it.each(accounts)("adds only the fixed %s hint, retaining scope/redirect/consent", async (accountType, email) => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const verification = parseGoogleOAuthVerification(`?auth_verification=1&account_type=${accountType}`);
    await startGoogleOAuth({ auth: { signInWithOAuth } }, origin, verification);
    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      ...normalRequest,
      options: { ...normalRequest.options, queryParams: { ...normalRequest.options.queryParams, login_hint: email } },
    });
  });

  it.each(["", "ADMIN", " general", "unknown", "constructor", "__proto__", "arbitrary@example.invalid", accounts[0][1], accounts[1][1]])(
    "rejects non-enum account type %s before the SDK", async accountType => {
      const signInWithOAuth = vi.fn();
      const input = `?auth_verification=1&account_type=${encodeURIComponent(accountType)}`;
      await expect(async () => startGoogleOAuth({ auth: { signInWithOAuth } }, origin, parseGoogleOAuthVerification(input)))
        .rejects.toThrow("検証用アカウントの指定が正しくありません。");
      expect(signInWithOAuth).not.toHaveBeenCalled();
    },
  );

  it.each([
    "?auth_verification=1", "?auth_verification=1&account_type=admin&account_type=general",
    "?auth_verification=1&account_type=admin&account_type=admin",
    "?auth_verification=1&account_type[]=admin",
    "?auth_verification=1&account_type=admin%26login_hint%3Darbitrary%40example.invalid",
  ])("rejects absent, ambiguous or injected selectors: %s", search => {
    expect(() => parseGoogleOAuthVerification(search)).toThrow("検証用アカウントの指定が正しくありません。");
  });

  it.each(["", "true", "false", "admin", "01", "1 ", "1&auth_verification=0", "1&auth_verification=1"])(
    "rejects malformed or duplicate explicit mode %s", mode => {
      expect(() => parseGoogleOAuthVerification(`?auth_verification=${mode}&account_type=admin`))
        .toThrow("検証モードの指定が正しくありません。");
    },
  );

  it.each(accounts)("ignores injected provider options alongside valid %s selection", async (accountType, email) => {
    const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
    const verification = parseGoogleOAuthVerification(`?auth_verification=1&account_type=${accountType}&login_hint=arbitrary@example.invalid&email=arbitrary@example.invalid&scope=other&scopes=other&prompt=select_account&redirect_to=https://evil.invalid`);
    await startGoogleOAuth({ auth: { signInWithOAuth } }, origin, verification);
    expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
      ...normalRequest,
      options: { ...normalRequest.options, queryParams: { ...normalRequest.options.queryParams, login_hint: email } },
    });
  });

  it.each([
    { enabled: true, accountType: "arbitrary@example.invalid" },
    { enabled: true, accountType: "constructor" },
    { enabled: true }, { enabled: "true", accountType: "admin" }, { accountType: "admin" },
  ])("validates programmatic callers again before the SDK: %j", async input => {
    const signInWithOAuth = vi.fn();
    await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, origin, input as GoogleOAuthVerification))
      .rejects.toThrow("検証用アカウントの指定が正しくありません。");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  for (const allowedOrigin of [origin, "https://school-os-meo.vercel.app", "http://localhost:3030", "http://localhost:3031"]) {
    it.each(accounts)(`preserves ${allowedOrigin} callback with %s hint`, async (accountType, email) => {
      const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
      await startGoogleOAuth({ auth: { signInWithOAuth } }, allowedOrigin, { enabled: true, accountType });
      expect(signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
        ...normalRequest,
        options: { ...normalRequest.options, redirectTo: `${allowedOrigin}/auth/callback`, queryParams: { ...normalRequest.options.queryParams, login_hint: email } },
      });
    });
  }

  it("verification never bypasses the existing origin allowlist", async () => {
    const signInWithOAuth = vi.fn();
    await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, "https://evil.invalid", { enabled: true, accountType: "admin" }))
      .rejects.toThrow("このURLからはログインを開始できません。");
    expect(signInWithOAuth).not.toHaveBeenCalled();
  });

  it.each(["normal", "admin", "general"] as const)("installed Supabase SDK serializes the %s request without URL rewriting or network", async mode => {
    const fetch = vi.fn(() => { throw new Error("No network is allowed in this SDK serialization test"); });
    const sdk = createClient("http://127.0.0.1:54321", "test-anon-key", {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch },
    });
    let authorizationUrl = "";
    await startGoogleOAuth({ auth: {
      signInWithOAuth: async input => {
        // Official SDK option, test only; application still performs its normal redirect.
        const result = await sdk.auth.signInWithOAuth({ ...input, options: { ...input.options, skipBrowserRedirect: true } });
        authorizationUrl = result.data.url ?? "";
        return result;
      },
    } }, origin, mode === "normal" ? undefined : { enabled: true, accountType: mode });
    const url = new URL(authorizationUrl);
    expect(url.origin + url.pathname).toBe("http://127.0.0.1:54321/auth/v1/authorize");
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe(`${origin}/auth/callback`);
    expect(url.searchParams.get("scopes")).toBe(normalRequest.options.scopes);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("login_hint")).toBe(accounts.find(([type]) => type === mode)?.[1] ?? null);
    expect(fetch).not.toHaveBeenCalled();
  });
});
