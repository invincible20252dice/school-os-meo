// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LEAD_RECOVERY_STORAGE_KEY } from "@/lib/google-lead-recovery-storage";
import { AuthCallbackClient } from "./auth-callback-client";

const m = vi.hoisted(() => ({
  router: { replace: vi.fn() }, exchange: vi.fn(), session: vi.fn(),
  setSession: vi.fn(), verifyOtp: vi.fn(), fetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => m.router }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: {
  exchangeCodeForSession: m.exchange, getSession: m.session,
  setSession: m.setSession, verifyOtp: m.verifyOtp,
} }) }));

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, "", "/auth/callback?code=synthetic-code&redirectTo=https://evil.invalid");
  m.exchange.mockResolvedValue({ error: null });
  m.session.mockResolvedValue({ data: { session: { access_token: "synthetic-token" } } });
  vi.stubGlobal("fetch", m.fetch);
  localStorage.setItem("synthetic-auth-marker", "preserved-session");
  sessionStorage.setItem(LEAD_RECOVERY_STORAGE_KEY, "synthetic-recovery-marker");
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

it.each([{ approved: true, target: "/dashboard" }, { approved: false, target: "/pending" }])(
  "routes approved=$approved only after exchange and authenticated approval lookup", async ({ approved, target }) => {
    let finish!: (response: Response) => void;
    m.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    render(<AuthCallbackClient />);
    await waitFor(() => expect(m.fetch).toHaveBeenCalledExactlyOnceWith("/api/auth/me", {
      headers: { Authorization: "Bearer synthetic-token" }, cache: "no-store",
    }));
    expect(m.exchange).toHaveBeenCalledExactlyOnceWith("synthetic-code");
    expect(m.setSession).not.toHaveBeenCalled(); expect(m.verifyOtp).not.toHaveBeenCalled();
    expect(m.router.replace).not.toHaveBeenCalled();
    await act(async () => finish(Response.json({ approved })));
    expect(m.router.replace).toHaveBeenCalledExactlyOnceWith(target);
  },
);

it("shows an exchange failure without approval lookup, redirect or recovery/session cleanup", async () => {
  m.exchange.mockResolvedValue({ error: { message: "Synthetic code expired" } });
  render(<AuthCallbackClient />);
  await screen.findByRole("heading", { name: "認証できませんでした。" });
  expect(screen.getByText("Synthetic code expired")).toBeTruthy();
  expect(screen.getByRole("link", { name: "ログイン画面へ戻る" }).getAttribute("href")).toBe("/login");
  expect(m.session).not.toHaveBeenCalled(); expect(m.fetch).not.toHaveBeenCalled();
  expect(m.router.replace).not.toHaveBeenCalled();
  expect(localStorage.getItem("synthetic-auth-marker")).toBe("preserved-session");
  expect(sessionStorage.getItem(LEAD_RECOVERY_STORAGE_KEY)).toBe("synthetic-recovery-marker");
});

it.each([true, false])("ignores late approved=%s after leaving the callback page", async approved => {
  let finish!: (response: Response) => void;
  m.fetch.mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
  const view = render(<AuthCallbackClient />);
  await waitFor(() => expect(m.fetch).toHaveBeenCalledTimes(1));
  view.unmount();
  await act(async () => finish(Response.json({ approved })));
  expect(m.router.replace).not.toHaveBeenCalled();
});
