import { createClient } from "@supabase/supabase-js";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ client: vi.fn(), clear: vi.fn() }));
vi.mock("./supabase", () => ({ createBrowserSupabaseClient: m.client }));
vi.mock("./google-lead-recovery-storage", () => ({ clearLeadRecovery: m.clear }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("real locked SDK emits SIGNED_OUT before returning 503; coordination preserves recovery until SDK retry succeeds", async () => {
  const values = new Map<string, string>();
  const sequence: string[] = [];
  const client = createClient("http://127.0.0.1:54321", "synthetic-only", {
    auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } } },
    global: { fetch: async input => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/token") return Response.json({ access_token: "synthetic-only", refresh_token: "synthetic-only-refresh", expires_in: 3600, token_type: "bearer", user: { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } });
      expect(url.pathname).toBe("/auth/v1/logout"); expect(url.searchParams.get("scope")).toBe("local");
      sequence.push("HTTP503"); return Response.json({ message: "synthetic outage" }, { status: 503 });
    } },
  });
  await client.auth.signInWithPassword({ email: "fixture@example.invalid", password: "synthetic-only" });
  const { data: { subscription } } = client.auth.onAuthStateChange(event => { if (event === "SIGNED_OUT") sequence.push(event); });
  expect((await client.auth.getSession()).data.session).not.toBeNull();
  const signOut = vi.spyOn(client.auth, "signOut");
  const replace = vi.fn(); vi.stubGlobal("window", { location: { replace } });
  m.client.mockReturnValue(client); m.clear.mockReturnValue(true);
  const logout = await import("./logout-operation");
  await logout.startLocalLogout();
  const firstResult = await signOut.mock.results[0].value;
  expect(firstResult.error.status).toBe(503); sequence.push("returned503");
  expect(sequence).toEqual(["HTTP503", "SIGNED_OUT", "returned503"]);
  expect(logout.getLogoutPhase()).toBe("failed");
  expect((await client.auth.getSession()).data.session).toBeNull();
  expect(values.has("sb-127-auth-token")).toBe(false);
  expect(m.clear).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  await logout.startLocalLogout();
  expect(signOut).toHaveBeenCalledTimes(2);
  expect(signOut.mock.calls).toEqual([[{ scope: "local" }], [{ scope: "local" }]]);
  expect(m.clear).toHaveBeenCalledTimes(1); expect(replace).toHaveBeenCalledWith("/login");
  expect(sequence.filter(event => event === "HTTP503")).toHaveLength(1);
  subscription.unsubscribe();
});
