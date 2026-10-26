// @vitest-environment jsdom
import { useLayoutEffect, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AuthApprovalGate from "@/components/dashboard/AuthApprovalGate";
import { AuthCallbackClient } from "./auth-callback-client";

// Real callback, exchange helper, gate and logout coordinator. Only the SDK,
// approval HTTP boundary and Next navigation transport are synthetic.
const m = vi.hoisted(() => ({
  router: { replace: vi.fn() }, pathname: "/auth/callback",
  exchange: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(),
  fetch: vi.fn(), protectedCommit: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => m.router, usePathname: () => m.pathname }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: {
  exchangeCodeForSession: m.exchange, getSession: m.session, onAuthStateChange: m.subscribe,
} }) }));

function ProtectedContent() {
  // Detect even a transient committed mount, not just the final DOM state.
  useLayoutEffect(() => { m.protectedCommit(); }, []);
  return <h1>Protected school data</h1>;
}
function Routes() {
  const [path, setPath] = useState("/auth/callback");
  m.pathname = path;
  useLayoutEffect(() => {
    m.router.replace.mockImplementation((next: string) => setPath(next));
  }, []);
  if (path === "/auth/callback") return <AuthCallbackClient />;
  if (path === "/login") return <h1>Login destination</h1>;
  if (path === "/pending") return <h1>Pending destination</h1>;
  if (path.startsWith("/dashboard")) return <AuthApprovalGate><ProtectedContent /></AuthApprovalGate>;
  throw new Error(`Unexpected synthetic route: ${path}`);
}
function expectProtectedAbsent() {
  expect(screen.queryByText("Protected school data")).toBeNull();
  expect(m.protectedCommit).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/auth/callback?code=synthetic-code");
  m.exchange.mockResolvedValue({ error: null });
  m.session.mockResolvedValue({ data: { session: { access_token: "synthetic-token" } }, error: null });
  m.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: m.unsubscribe } } });
  vi.stubGlobal("fetch", m.fetch);
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it("carries a callback with no session through the gate to login without mounting protected content", async () => {
  m.session.mockResolvedValue({ data: { session: null }, error: null });
  render(<Routes />);
  expectProtectedAbsent();
  await screen.findByRole("heading", { name: "Login destination" });
  expectProtectedAbsent();
  expect(m.exchange).toHaveBeenCalledExactlyOnceWith("synthetic-code");
  expect(m.session).toHaveBeenCalledTimes(2); // callback then actual gate
  expect(m.subscribe).toHaveBeenCalledTimes(1);
  expect(m.unsubscribe).toHaveBeenCalledTimes(1);
  expect(m.fetch).not.toHaveBeenCalled();
});

it.each([
  { kind: "HTTP failure despite approved body", response: () => Response.json({ approved: true }, { status: 503 }) },
  { kind: "unknown approval", response: () => Response.json({}) },
])("carries callback $kind into a fail-closed gate and explicit retry", async ({ response }) => {
  let finishRetry!: (response: Response) => void;
  m.fetch.mockImplementationOnce(async () => response()) // callback lookup
    .mockImplementationOnce(async () => response()) // independent gate lookup
    .mockImplementationOnce(() => new Promise<Response>(resolve => { finishRetry = resolve; }));
  render(<Routes />);
  expectProtectedAbsent();
  await screen.findByRole("alert");
  expectProtectedAbsent();
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(m.exchange).toHaveBeenCalledExactlyOnceWith("synthetic-code");

  fireEvent.click(screen.getByRole("button", { name: "再度確認" }));
  await waitFor(() => expect(m.fetch).toHaveBeenCalledTimes(3));
  expectProtectedAbsent(); // pending retry must not reveal school data
  for (const call of m.fetch.mock.calls) {
    expect(call).toEqual(["/api/auth/me", {
      headers: { Authorization: "Bearer synthetic-token" }, cache: "no-store",
    }]);
  }
  await act(async () => finishRetry(response()));
  await screen.findByRole("alert");
  expectProtectedAbsent();
  expect(screen.getByRole("button", { name: "再度確認" })).toBeTruthy();
  expect(m.exchange).toHaveBeenCalledTimes(1); // retry approval, not OAuth

  // Positive control: the harness must be capable of rendering the real gate's
  // child, but only after a fresh explicit approval on another user retry.
  m.fetch.mockResolvedValueOnce(Response.json({ approved: true }));
  fireEvent.click(screen.getByRole("button", { name: "再度確認" }));
  await screen.findByRole("heading", { name: "Protected school data" });
  expect(m.fetch).toHaveBeenCalledTimes(4);
  expect(m.protectedCommit).toHaveBeenCalledTimes(1);
  expect(m.exchange).toHaveBeenCalledTimes(1);
});
