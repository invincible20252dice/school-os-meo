import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
import { startGoogleOAuth } from "./supabase-auth";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it.each([
  "https://app.jukumeo.com.evil.invalid",
  "https://app.jukumeo.com:444",
])("rejecting %s preserves the real SDK session across retry and client reload", async origin => {
  vi.stubEnv("NODE_ENV", "production");
  const values = new Map<string, string>();
  const requests: string[] = [];
  const storageKey = "synthetic-origin-rejection-session";
  const makeClient = () => createClient("http://127.0.0.1:54321", "synthetic-only", {
    auth: {
      storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => { values.set(key, value); },
        removeItem: key => { values.delete(key); },
      },
    },
    global: { fetch: async input => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.pathname === "/auth/v1/logout") return new Response(null, { status: 204 });
      expect(url.pathname).toBe("/auth/v1/token");
      return Response.json({
        access_token: "synthetic-only", refresh_token: "synthetic-only-refresh",
        expires_in: 3600, token_type: "bearer",
        user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated",
          app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
      });
    } },
  });
  const client = makeClient();
  const login = await client.auth.signInWithPassword({ email: "fixture@example.invalid", password: "synthetic-only" });
  expect(login.error).toBeNull();
  expect(login.data.session).not.toBeNull();
  const persisted = values.get(storageKey);
  expect(persisted).toBeDefined();
  const oauth = vi.spyOn(client.auth, "signInWithOAuth");
  const signOut = vi.spyOn(client.auth, "signOut");
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect(startGoogleOAuth(client, origin)).rejects.toThrow("このURLではGoogleログインを開始できません");
    expect(values.get(storageKey)).toBe(persisted);
    expect((await client.auth.getSession()).data.session).toEqual(login.data.session);
  }
  expect(oauth).not.toHaveBeenCalled();
  expect(signOut).not.toHaveBeenCalled();
  const reloaded = await makeClient().auth.getSession();
  expect(reloaded.error).toBeNull();
  expect(reloaded.data.session).toEqual(login.data.session);
  expect(requests).toEqual(["/auth/v1/token"]);
});
