import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leaveDashboard, signOutCurrentSession } from "./logout";
function client(signOut = vi.fn().mockResolvedValue({ error: null }), session: unknown = null, error: unknown = null) {
  return { auth: { signOut, getSession: vi.fn().mockResolvedValue({ data: { session }, error }) } };
}
describe("local session logout", () => {
  it("uses local scope and checks removal before completing", async () => {
    const c = client(); await signOutCurrentSession(c as unknown as SupabaseClient);
    expect(c.auth.signOut).toHaveBeenCalledWith({ scope: "local" }); expect(c.auth.getSession).toHaveBeenCalledOnce();
    expect(c.auth.signOut.mock.invocationCallOrder[0]).toBeLessThan(c.auth.getSession.mock.invocationCallOrder[0]);
  });
  it("reports provider failure without claiming success or leaking details", async () => {
    const c = client(vi.fn().mockResolvedValue({ error: new Error("secret detail") }));
    await expect(signOutCurrentSession(c as unknown as SupabaseClient)).rejects.toThrow("ログアウトを完了できませんでした");
    expect(c.auth.getSession).not.toHaveBeenCalled();
  });
  it.each([[{ access_token: "synthetic" }, null], [null, new Error("storage")]])("rejects an unconfirmed local removal", async (session, error) => {
    await expect(signOutCurrentSession(client(undefined, session, error) as unknown as SupabaseClient)).rejects.toThrow("ログアウトを確認できませんでした");
  });
  it("propagates transport failure to the UI rather than navigating", async () => {
    await expect(signOutCurrentSession(client(vi.fn().mockRejectedValue(new Error("network"))) as unknown as SupabaseClient)).rejects.toThrow();
  });
  it("replaces the document and its history entry only when invoked after successful removal", () => {
    const replace = vi.fn(); vi.stubGlobal("window", { location: { replace } });
    try { leaveDashboard(); expect(replace).toHaveBeenCalledWith("/login"); } finally { vi.unstubAllGlobals(); }
  });
});
