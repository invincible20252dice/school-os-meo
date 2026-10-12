import { afterEach, expect, it, vi } from "vitest";
import { startGoogleOAuth } from "./supabase-auth";
const origin = "https://school-os-fixed-team.vercel.app";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("uses a same-origin server decision before OAuth on a candidate", async () => {
  vi.stubGlobal("window", { location: { origin } });
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ origin }) });
  vi.stubGlobal("fetch", fetch);
  const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
  await startGoogleOAuth({ auth: { signInWithOAuth } }, origin);
  expect(fetch).toHaveBeenCalledWith("/api/auth/deployment-origin", expect.objectContaining({ method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error" }));
  expect(fetch.mock.invocationCallOrder[0]).toBeLessThan(signInWithOAuth.mock.invocationCallOrder[0]);
  expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ redirectTo: `${origin}/auth/callback` }) }));
});
it.each(["denied", "wrong", "malformed", "network"])("does not call OAuth on %s policy response", async kind => {
  vi.stubGlobal("window", { location: { origin } });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
    if (kind === "network") throw new Error("secret");
    return { ok: kind !== "denied", json: async () => kind === "malformed" ? null : { origin: "https://other.vercel.app" } };
  }));
  const signInWithOAuth = vi.fn();
  await expect(startGoogleOAuth({ auth: { signInWithOAuth } }, origin)).rejects.toThrow("このURLからはログインを開始できません。");
  expect(signInWithOAuth).not.toHaveBeenCalled();
});
it("does not ask policy for a supplied origin different from the browser", async () => {
  vi.stubGlobal("window", { location: { origin: "https://evil.invalid" } });
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(startGoogleOAuth({ auth: { signInWithOAuth: vi.fn() } }, origin)).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["https://app.jukumeo.com", "https://school-os-meo.vercel.app", "http://localhost:3030", "http://localhost:3031"])("keeps %s independent of verification mode", async allowed => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const signInWithOAuth = vi.fn().mockResolvedValue({ error: null });
  await startGoogleOAuth({ auth: { signInWithOAuth } }, allowed);
  expect(fetch).not.toHaveBeenCalled(); expect(signInWithOAuth).toHaveBeenCalledOnce();
});
