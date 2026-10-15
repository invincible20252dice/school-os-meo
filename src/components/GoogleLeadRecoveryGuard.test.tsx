// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { createLeadOperationKey } from "@/lib/google-lead-operation-key";
import type * as Recovery from "@/lib/google-lead-recovery-storage";

const mocks = vi.hoisted(() => ({ logoutPhase: "idle", pathname: "/dashboard/roi", params: new URLSearchParams("schoolId=a"), subscribe: vi.fn(), client: vi.fn(), unsubscribe: vi.fn(), router: { push: vi.fn(), replace: vi.fn() }, session: vi.fn() }));
vi.mock("@/lib/logout-operation", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/logout-operation")>(), getLogoutPhase: () => mocks.logoutPhase }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useSearchParams: () => mocks.params, useRouter: () => mocks.router }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: mocks.client }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/components/dashboard/AuthAccessBadge", () => ({ default: () => null }));
let storage: typeof Recovery;
let Guard: typeof import("./GoogleLeadRecoveryGuard").default;
const userId = "11111111-1111-4111-8111-111111111111";
const otherUser = "22222222-2222-4222-8222-222222222222";
const scope = { userId, schoolId: "a", route: "/dashboard/roi" };
const now = 1_800_000_000_000;
const op = { ...scope, operationId: createLeadOperationKey(userId, "line", "33333333-3333-4333-8333-333333333333"), startedAt: now, state: "response_unknown" as const };
function seeded() { window.sessionStorage.setItem(storage.LEAD_RECOVERY_STORAGE_KEY, JSON.stringify([op])); window.sessionStorage.setItem("unrelated", "preserved"); }
function auth(event: string, id: string | null) { act(() => { mocks.subscribe.mock.calls.at(-1)![0](event, id ? { user: { id } } : null); }); }
const exists = () => window.sessionStorage.getItem(storage.LEAD_RECOVERY_STORAGE_KEY) !== null;
beforeEach(async () => {
  mocks.logoutPhase = "idle";
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now);
  window.sessionStorage.clear(); mocks.pathname = "/dashboard/roi"; mocks.params = new URLSearchParams("schoolId=a");
  Object.defineProperty(window.performance, "getEntriesByType", { configurable: true, value: () => [{ type: "reload" }] });
  mocks.subscribe.mockImplementation(() => ({ data: { subscription: { unsubscribe: mocks.unsubscribe } } }));
  mocks.client.mockReturnValue({ auth: { onAuthStateChange: mocks.subscribe, getSession: mocks.session } });
  mocks.session.mockResolvedValue({ data: { session: { access_token: "synthetic", user: { id: userId } } } });
  storage = await import("@/lib/google-lead-recovery-storage"); Guard = (await import("./GoogleLeadRecoveryGuard")).default;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("keeps a same-user reload and synchronously discards on user switch or sign-out without calling auth APIs", () => {
  seeded(); render(<Guard />); auth("INITIAL_SESSION", userId); expect(exists()).toBe(true);
  auth("SIGNED_IN", otherUser); expect(exists()).toBe(false); expect(mocks.session).not.toHaveBeenCalled();
  auth("SIGNED_OUT", null); expect(window.sessionStorage.getItem("unrelated")).toBe("preserved");
  expect(storage.saveLeadRecovery(op)).toBe(false);
});
it("removes before authentication when school or route changes and never restores old operations", () => {
  seeded(); const view = render(<Guard />); auth("INITIAL_SESSION", userId);
  mocks.params = new URLSearchParams("schoolId=b"); view.rerender(<Guard />); expect(exists()).toBe(false);
  mocks.params = new URLSearchParams("schoolId=a"); view.rerender(<Guard />); expect(storage.readLeadRecovery(scope).operations).toEqual([]);
  storage.readLeadRecovery(scope); storage.saveLeadRecovery(op); expect(exists()).toBe(true);
  mocks.pathname = "/dashboard/settings"; view.rerender(<Guard />); expect(exists()).toBe(false); expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  expect(storage.updateLeadRecovery(op.operationId, "response_unknown", scope)).toBe(false);
});
it.each(["/login", "/survey/public", "/dashboard"])("cleans metadata on %s without initializing the auth SDK", (pathname) => {
  seeded(); mocks.pathname = pathname; render(<Guard />);
  expect(exists()).toBe(false); expect(mocks.client).not.toHaveBeenCalled();
});
it("deletes at the absolute expiry and schedules a newly-created operation without extending retention", () => {
  seeded(); const view = render(<Guard />); auth("INITIAL_SESSION", userId);
  act(() => { vi.advanceTimersByTime(storage.LEAD_RECOVERY_MAX_AGE_MS - 1); }); expect(exists()).toBe(true);
  act(() => { vi.advanceTimersByTime(1); }); expect(exists()).toBe(false);
  storage.readLeadRecovery(scope);
  act(() => { storage.saveLeadRecovery({ ...op, startedAt: Date.now() }); }); expect(exists()).toBe(true);
  act(() => { vi.advanceTimersByTime(storage.LEAD_RECOVERY_MAX_AGE_MS); }); expect(exists()).toBe(false);
  view.unmount();
  // React/jsdom may own zero-delay timers; assert no feature mutation after disposal.
  seeded(); vi.advanceTimersByTime(storage.LEAD_RECOVERY_MAX_AGE_MS); expect(exists()).toBe(true);
});
it("rechecks expiry on returning to a background tab and clears bfcache restorations", () => {
  seeded(); render(<Guard />); auth("INITIAL_SESSION", userId);
  vi.setSystemTime(now + storage.LEAD_RECOVERY_MAX_AGE_MS);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); }); expect(exists()).toBe(false);
  storage.readLeadRecovery(scope); act(() => { storage.saveLeadRecovery({ ...op, startedAt: Date.now() }); });
  act(() => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })); }); expect(exists()).toBe(true);
  act(() => { window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); }); expect(exists()).toBe(false);
});
it("is safe across StrictMode setup/cleanup and ignores a stale auth callback", () => {
  const timers = vi.spyOn(window, "setTimeout"); const cleared = vi.spyOn(window, "clearTimeout");
  seeded(); const view = render(<StrictMode><Guard /></StrictMode>);
  expect(mocks.subscribe).toHaveBeenCalledTimes(2); const oldCallback = mocks.subscribe.mock.calls[0][0];
  act(() => { oldCallback("SIGNED_OUT", null); }); expect(exists()).toBe(true);
  auth("INITIAL_SESSION", userId); view.unmount(); expect(mocks.unsubscribe).toHaveBeenCalledTimes(2);
  const expiryTimers = timers.mock.calls.flatMap((call, index) => call[1] === storage.LEAD_RECOVERY_MAX_AGE_MS ? [timers.mock.results[index].value] : []);
  expect(expiryTimers).toHaveLength(2);
  for (const timer of expiryTimers) expect(cleared).toHaveBeenCalledWith(timer);
});
it("clears feature metadata if auth listener setup is unavailable", () => {
  seeded(); mocks.client.mockImplementation(() => { throw new Error("unconfigured"); });
  render(<Guard />); expect(exists()).toBe(false); expect(window.sessionStorage.getItem("unrelated")).toBe("preserved");
});
it("does not invent successful deletion when storage refuses removal", () => {
  seeded(); render(<Guard />); auth("INITIAL_SESSION", userId);
  const denied = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("denied"); });
  auth("SIGNED_OUT", null); denied.mockRestore();
  expect(exists()).toBe(true); expect(storage.readLeadRecovery(scope)).toEqual({ ok: false, operations: [] });
});
it("successful local logout removes only recovery data", async () => {
  vi.useRealTimers(); seeded(); storage.readLeadRecovery(scope);
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ currentSchoolId: "a", currentSchoolName: "校舎A", schools: [] }))));
  const signOut = vi.fn().mockResolvedValue({ error: null });
  mocks.client.mockReturnValue({ auth: { getSession: mocks.session, signOut } });
  const Header = (await import("./dashboard/DashboardHeader")).default;
  render(<Header />); await waitFor(() => expect(screen.getByText("校舎A")).toBeTruthy());
  const logout = screen.getByRole("button", { name: "ログアウト" });
  fireEvent.click(logout);
  await waitFor(() => expect(exists()).toBe(false));
  expect(signOut).toHaveBeenCalledWith({ scope: "local" }); expect(window.sessionStorage.getItem("unrelated")).toBe("preserved");
  expect(mocks.subscribe).not.toHaveBeenCalled();
});

it.each(["pending", "failed"])("defers null-session cleanup only during explicit logout %s; identity/school changes still clear", phase => {
  seeded(); const view = render(<Guard />); auth("INITIAL_SESSION", userId);
  mocks.logoutPhase = phase;
  auth("SIGNED_OUT", null); auth("INITIAL_SESSION", null); auth("SIGNED_OUT", null);
  expect(exists()).toBe(true);
  auth("SIGNED_IN", otherUser); expect(exists()).toBe(false);
  seeded(); mocks.params = new URLSearchParams("schoolId=b"); view.rerender(<Guard />);
  expect(exists()).toBe(false);
});
