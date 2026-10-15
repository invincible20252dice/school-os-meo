// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ signOut: vi.fn(), clear: vi.fn(), replace: vi.fn(), client: vi.fn() }));
vi.mock("./supabase", () => ({ createBrowserSupabaseClient: m.client }));
vi.mock("./google-lead-recovery-storage", () => ({ clearLeadRecovery: m.clear }));
let logout: typeof import("./logout-operation");
beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks();
  m.signOut.mockReset().mockResolvedValue({ error: null }); m.clear.mockReturnValue(true);
  m.client.mockReturnValue({ auth: { signOut: m.signOut } });
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, { get: (target, key) => key === "location" ? { replace: m.replace } : Reflect.get(target, key, target) }));
  logout = await import("./logout-operation");
});
afterEach(() => vi.unstubAllGlobals());
it("publishes pending before SDK entry, suppresses duplicates and only then clears and replaces", async () => {
  let done!: (value: { error: null }) => void;
  m.signOut.mockImplementation(() => { expect(logout.getLogoutPhase()).toBe("pending"); return new Promise(resolve => { done = resolve; }); });
  const events: string[] = []; const remove = logout.subscribeLogout(() => events.push(logout.getLogoutPhase()));
  expect(logout.getLogoutPhase()).toBe("idle");
  const first = logout.startLocalLogout(); await logout.startLocalLogout();
  expect(m.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(m.clear).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
  done({ error: null }); await first;
  expect(events).toEqual(["pending", "complete"]);
  expect(m.clear).toHaveBeenCalledTimes(1); expect(m.replace).toHaveBeenCalledWith("/login");
  expect(m.clear.mock.invocationCallOrder[0]).toBeLessThan(m.replace.mock.invocationCallOrder[0]);
  await logout.startLocalLogout(); expect(m.signOut).toHaveBeenCalledTimes(1); remove();
});
it.each(["returned", "thrown", "client"])("preserves recovery/navigation on %s failure and retries via local SDK", async kind => {
  if (kind === "returned") m.signOut.mockResolvedValueOnce({ error: new Error("private") });
  if (kind === "thrown") m.signOut.mockRejectedValueOnce(new Error("private"));
  if (kind === "client") m.client.mockImplementationOnce(() => { throw new Error("unconfigured"); });
  const listener = vi.fn(); const remove = logout.subscribeLogout(listener); remove();
  await logout.startLocalLogout();
  expect(logout.getLogoutPhase()).toBe("failed");
  expect(m.clear).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled();
  await logout.startLocalLogout(); expect(logout.getLogoutPhase()).toBe("complete");
  expect(m.signOut).toHaveBeenLastCalledWith({ scope: "local" });
});
it("does not navigate when recovery removal is refused", async () => {
  m.clear.mockReturnValueOnce(false);
  await logout.startLocalLogout();
  expect(logout.getLogoutPhase()).toBe("failed"); expect(m.replace).not.toHaveBeenCalled();
  await logout.startLocalLogout(); expect(m.replace).toHaveBeenCalledWith("/login");
});
it("exposes a stable idle server snapshot without creating operation state", () => {
  vi.stubGlobal("window", undefined);
  expect(logout.getLogoutPhase()).toBe("idle"); expect(logout.getServerLogoutPhase()).toBe("idle");
});
