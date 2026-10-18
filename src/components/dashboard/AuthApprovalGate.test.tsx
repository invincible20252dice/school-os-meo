// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { startLocalLogout } from "@/lib/logout-operation";
import { LEAD_RECOVERY_STORAGE_KEY } from "@/lib/google-lead-recovery-storage";
import Gate from "./AuthApprovalGate";
const m = vi.hoisted(() => ({ signOut: vi.fn(), session: vi.fn(), subscribe: vi.fn(), replace: vi.fn(), unsubscribe: vi.fn(), router: { replace: vi.fn() } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/settings", useRouter: () => m.router }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut: m.signOut, getSession: m.session, onAuthStateChange: m.subscribe } }) }));
beforeEach(() => {
  const realWindow = window;
  vi.stubGlobal("window", new Proxy(realWindow, { get: (target, key) => key === "location" ? { replace: m.replace } : Reflect.get(target, key, target) }));
  vi.clearAllMocks(); m.signOut.mockReset().mockResolvedValue({ error: null }); m.session.mockResolvedValue({ data: { session: { access_token: "fake" } }, error: null });
  m.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: m.unsubscribe } } });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ approved: true })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not mount protected content without a session and replaces login", async () => {
  m.session.mockResolvedValue({ data: { session: null }, error: null });
  render(<Gate><div>protected</div></Gate>);
  expect(screen.queryByText("protected")).toBeNull();
  await waitFor(() => expect(m.router.replace).toHaveBeenCalledWith("/login"));
});
it("allows authenticated content and hides it on signed out", async () => {
  render(<Gate><div>protected</div></Gate>); await screen.findByText("protected");
  act(() => m.subscribe.mock.calls[0][0]("SIGNED_OUT", null));
  expect(screen.queryByText("protected")).toBeNull();
  expect(m.router.replace).toHaveBeenCalledWith("/login");
});
it("rejects late approval after signout", async () => {
  let done!: (value: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { done = resolve; })));
  render(<Gate><div>protected</div></Gate>);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  act(() => m.subscribe.mock.calls[0][0]("SIGNED_OUT", null));
  await act(async () => done(Response.json({ approved: true })));
  expect(screen.queryByText("protected")).toBeNull();
});
it.each([
  { approved: true, phase: "pending" },
  { approved: false, phase: "pending" },
  { approved: true, phase: "failed" },
  { approved: false, phase: "failed" },
])("ignores late approval=$approved during $phase logout without an auth event", async ({ approved, phase }) => {
  let approve!: (value: Response) => void;
  let finishLogout!: (value: { error: Error }) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { approve = resolve; })));
  m.signOut.mockImplementationOnce(() => new Promise(resolve => { finishLogout = resolve; }));
  sessionStorage.setItem(LEAD_RECOVERY_STORAGE_KEY, "synthetic recovery marker");
  render(<Gate><div>protected</div></Gate>);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

  let logout!: Promise<void>;
  act(() => { logout = startLocalLogout(); });
  expect(screen.getByRole("status").textContent).toContain("ログアウト中");
  const failLogout = async () => {
    await act(async () => { finishLogout({ error: new Error("private failure") }); await logout; });
  };
  if (phase === "failed") await failLogout();
  // Deliberately do not emit SIGNED_OUT: the logout phase must guard this response.
  await act(async () => approve(Response.json({ approved })));
  expect(screen.queryByText("protected")).toBeNull();
  expect(m.router.replace).not.toHaveBeenCalled();
  expect(m.replace).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(LEAD_RECOVERY_STORAGE_KEY)).toBe("synthetic recovery marker");
  if (phase === "pending") {
    expect(screen.getByRole("status").textContent).toContain("ログアウト中");
    await failLogout();
  }
  expect(screen.getByRole("alert").textContent).toContain("再度");
  expect(m.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(m.router.replace).not.toHaveBeenCalled();
  expect(m.replace).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(LEAD_RECOVERY_STORAGE_KEY)).toBe("synthetic recovery marker");

  await act(async () => screen.getByRole("button", { name: "ログアウトを再試行" }).click());
  expect(m.signOut).toHaveBeenCalledTimes(2);
  expect(m.signOut).toHaveBeenLastCalledWith({ scope: "local" });
  expect(sessionStorage.getItem(LEAD_RECOVERY_STORAGE_KEY)).toBeNull();
  expect(m.replace).toHaveBeenCalledExactlyOnceWith("/login");
  expect(screen.queryByText("protected")).toBeNull();
});
it("preserves the pending approval redirect", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ approved: false })));
  render(<Gate><div>protected</div></Gate>);
  await waitFor(() => expect(m.router.replace).toHaveBeenCalledWith("/pending"));
  expect(screen.queryByText("protected")).toBeNull();
});
it("rechecks history restoration and does not display signed-out content", async () => {
  render(<Gate><div>protected</div></Gate>); await screen.findByText("protected");
  act(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
  m.session.mockResolvedValue({ data: { session: null }, error: null });
  act(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
  await waitFor(() => expect(m.router.replace).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("protected")).toBeNull();
});
it.each(["session-error", "session-throw", "approval-http", "approval-unknown"])("fails closed with visible retry for %s", async kind => {
  if (kind === "session-error") m.session.mockResolvedValueOnce({ data: { session: null }, error: new Error("private") });
  if (kind === "session-throw") m.session.mockRejectedValueOnce(new Error("private"));
  if (kind === "approval-http") vi.mocked(fetch).mockResolvedValueOnce(Response.json({ approved: true }, { status: 503 }));
  if (kind === "approval-unknown") vi.mocked(fetch).mockResolvedValueOnce(Response.json({}));
  render(<Gate><div>protected</div></Gate>);
  const alert = await screen.findByRole("alert");
  expect(alert.closest("[hidden]")).toBeNull();
  expect(screen.queryByText("protected")).toBeNull();
  expect(m.router.replace).not.toHaveBeenCalled();
  await act(async () => screen.getByRole("button", { name: "再度確認" }).click());
  await screen.findByText("protected");
  expect(m.unsubscribe).toHaveBeenCalledTimes(1);
});
it("ignores auth events and pending session results after unmount", async () => {
  let done!: (value: unknown) => void;
  m.session.mockReturnValueOnce(new Promise(resolve => { done = resolve; }));
  const view = render(<Gate><div>protected</div></Gate>);
  const callback = m.subscribe.mock.calls[0][0]; view.unmount();
  await act(async () => { callback("SIGNED_OUT", null); done({ data: { session: null }, error: null }); });
  expect(m.unsubscribe).toHaveBeenCalledTimes(1);
  expect(m.router.replace).not.toHaveBeenCalled();
});

it("keeps a safe retry panel after SDK SIGNED_OUT then error and delayed events", async () => {
  render(<Gate><div>protected customer data</div></Gate>); await screen.findByText("protected customer data");
  m.signOut.mockImplementationOnce(async () => {
    m.session.mockResolvedValue({ data: { session: null }, error: null });
    m.subscribe.mock.calls[0][0]("SIGNED_OUT", null);
    return { error: new Error("503 private") };
  });
  await act(async () => startLocalLogout());
  expect(screen.queryByText("protected customer data")).toBeNull();
  expect((await screen.findByRole("alert")).textContent).toContain("再度");
  act(() => { m.subscribe.mock.calls[0][0]("SIGNED_OUT", null); window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })); });
  expect(m.router.replace).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
  await act(async () => screen.getByRole("button", { name: "ログアウトを再試行" }).click());
  expect(m.signOut).toHaveBeenCalledTimes(2);
  expect(m.signOut).toHaveBeenLastCalledWith({ scope: "local" });
  expect(m.replace).toHaveBeenCalledWith("/login");
});
it("replaces login again when a completed logout document is restored from history", async () => {
  render(<Gate><div>protected</div></Gate>); await screen.findByText("protected");
  await act(async () => startLocalLogout()); expect(m.replace).toHaveBeenCalledTimes(1);
  act(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  expect(m.replace).toHaveBeenCalledTimes(2);
  expect(m.replace).toHaveBeenLastCalledWith("/login");
  expect(screen.queryByText("protected")).toBeNull();
});
