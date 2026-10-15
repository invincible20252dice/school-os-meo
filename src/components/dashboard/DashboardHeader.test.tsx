// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Header from "./DashboardHeader";
const m = vi.hoisted(() => ({ signOut: vi.fn(), clear: vi.fn(), replace: vi.fn(), router: { replace: vi.fn(), push: vi.fn() }, params: new URLSearchParams("schoolId=a") }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard", useRouter: () => m.router, useSearchParams: () => m.params }));
vi.mock("@/components/dashboard/AuthAccessBadge", () => ({ default: () => null }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { signOut: m.signOut, getSession: async () => ({ data: { session: { access_token: "fake" } } }) } }) }));
vi.mock("@/lib/google-lead-recovery-storage", () => ({ clearLeadRecovery: m.clear }));
beforeEach(() => {
  vi.clearAllMocks(); m.clear.mockReturnValue(true); m.signOut.mockResolvedValue({ error: null });
  const original = window;
  vi.stubGlobal("window", new Proxy(original, { get(target, key) { return key === "location" ? { replace: m.replace } : Reflect.get(target, key, target); } }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ currentSchoolId: "a", currentSchoolName: "校舎A" })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function setup() { render(<Header />); await screen.findByText("校舎A"); return screen.getByRole("button", { name: "ログアウト" }); }
it("signs out locally once and only then clears recovery and replaces history", async () => {
  let done!: (value: { error: null }) => void;
  m.signOut.mockReturnValue(new Promise(resolve => { done = resolve; }));
  const button = await setup(); fireEvent.click(button); fireEvent.click(button);
  expect(m.signOut).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(m.clear).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
  expect((button as HTMLButtonElement).disabled).toBe(true);
  await act(async () => done({ error: null }));
  expect(m.clear).toHaveBeenCalledTimes(1); expect(m.replace).toHaveBeenCalledExactlyOnceWith("/login");
  expect(m.clear.mock.invocationCallOrder[0]).toBeLessThan(m.replace.mock.invocationCallOrder[0]);
});
it.each(["returned", "thrown"])("keeps recovery and page on %s error and allows retry", async kind => {
  if (kind === "returned") m.signOut.mockResolvedValueOnce({ error: new Error("private provider detail") });
  else m.signOut.mockRejectedValueOnce(new Error("private provider detail"));
  const button = await setup(); fireEvent.click(button);
  expect((await screen.findByRole("alert")).textContent).toContain("再度");
  expect(screen.queryByText("private provider detail")).toBeNull();
  expect(m.clear).not.toHaveBeenCalled(); expect(m.replace).not.toHaveBeenCalled();
  fireEvent.click(button); await waitFor(() => expect(m.replace).toHaveBeenCalledWith("/login"));
  expect(m.signOut).toHaveBeenCalledTimes(2);
});
