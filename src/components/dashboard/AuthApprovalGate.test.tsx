// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuthApprovalGate, { LogoutButton } from "./AuthApprovalGate";
const h = vi.hoisted(() => ({ replace: vi.fn(), session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn(), pathname: "/dashboard", fetch: vi.fn(), signOut: vi.fn(), leave: vi.fn() }));
vi.mock("next/navigation", () => { const router = { replace: h.replace }; return { usePathname: () => h.pathname, useRouter: () => router }; });
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: h.session, onAuthStateChange: h.subscribe, signOut: h.signOut } }) }));
vi.mock("@/lib/logout", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/logout")>(), leaveDashboard: h.leave }));
beforeEach(() => {
  h.signOut.mockReset(); h.leave.mockReset();
  h.pathname = "/dashboard"; h.replace.mockReset(); h.session.mockReset().mockResolvedValue({ data: { session: { access_token: "synthetic" } }, error: null });
  h.subscribe.mockReset().mockReturnValue({ data: { subscription: { unsubscribe: h.unsubscribe } } });
  h.fetch.mockReset().mockResolvedValue({ ok: true, json: async () => ({ authenticated: true, approved: true }) }); vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<AuthApprovalGate><div>Protected content</div></AuthApprovalGate>);
describe("dashboard session boundary", () => {
  it("preserves an unsaved draft when focus revalidates the same authenticated page", async () => {
    render(<AuthApprovalGate><input aria-label="Draft" defaultValue="" /></AuthApprovalGate>);
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsaved" } });
    act(() => window.dispatchEvent(new Event("focus")));
    await waitFor(() => expect(screen.getByRole("textbox")).toBeTruthy());
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("unsaved");
  });
  it("withholds content until authenticated approval resolves", async () => {
    let resolve!: (value: unknown) => void; h.fetch.mockReturnValue(new Promise(r => { resolve = r; }));
    mount(); expect(screen.queryByText("Protected content")).toBeNull();
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    await act(async () => resolve({ ok: true, json: async () => ({ authenticated: true, approved: true }) }));
    expect(screen.getByText("Protected content")).toBeTruthy();
  });
  it("sends missing session to login without mounting children or calling business APIs", async () => {
    h.session.mockResolvedValue({ data: { session: null }, error: null }); mount();
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Protected content")).toBeNull(); expect(h.fetch).not.toHaveBeenCalled();
  });
  it.each([{ authenticated: false, approved: true }, { authenticated: true, approved: false }])("rejects server refusal %j", async body => {
    h.fetch.mockResolvedValue({ ok: true, json: async () => body }); mount();
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith(body.authenticated ? "/pending" : "/login"));
    expect(screen.queryByText("Protected content")).toBeNull();
  });
  it("fails closed on server errors and retries without exposing the error payload", async () => {
    h.fetch.mockRejectedValueOnce(new Error("sensitive provider body")); mount();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Protected content")).toBeNull(); expect(document.body.textContent).not.toContain("sensitive");
    fireEvent.click(screen.getByRole("button", { name: "再確認" }));
    await waitFor(() => expect(screen.getByText("Protected content")).toBeTruthy());
  });
  it("invalidates an in-flight approval after signed-out notification", async () => {
    let resolve!: (value: unknown) => void; h.fetch.mockReturnValue(new Promise(r => { resolve = r; })); mount();
    await waitFor(() => expect(h.fetch).toHaveBeenCalled());
    act(() => h.subscribe.mock.calls[0][0]("SIGNED_OUT", null));
    await act(async () => resolve({ ok: true, json: async () => ({ authenticated: true, approved: true }) }));
    expect(screen.queryByText("Protected content")).toBeNull(); expect(h.replace).toHaveBeenCalledWith("/login");
  });
  it("hides before BFCache and rechecks session on pageshow", async () => {
    mount(); await waitFor(() => expect(screen.getByText("Protected content")).toBeTruthy());
    act(() => window.dispatchEvent(new Event("pagehide")));
    expect(screen.queryByText("Protected content")).toBeNull();
    h.session.mockResolvedValue({ data: { session: null }, error: null });
    act(() => window.dispatchEvent(new Event("pageshow")));
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/login")); expect(screen.queryByText("Protected content")).toBeNull();
  });
});


describe("logout control", () => {
  it("waits for local signOut and removal before leaving, without a global revocation", async () => {
    let finish!: () => void;
    h.signOut.mockImplementation(() => new Promise(resolve => { finish = () => { h.session.mockResolvedValue({ data: { session: null }, error: null }); h.subscribe.mock.calls[0][0]("SIGNED_OUT", null); resolve({ error: null }); }; }));
    render(<AuthApprovalGate><LogoutButton>ログアウト</LogoutButton><span>Protected content</span></AuthApprovalGate>);
    await waitFor(() => expect(screen.getByRole("button", { name: "ログアウト" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    expect(screen.queryByText("Protected content")).toBeNull(); expect(h.leave).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(h.signOut).toHaveBeenCalledWith({ scope: "local" }); expect(h.leave).toHaveBeenCalledOnce();
    expect(h.replace).not.toHaveBeenCalled();
  });
  it("keeps failure visible even if the SDK cleared storage and emitted SIGNED_OUT", async () => {
    h.signOut.mockImplementation(async () => { h.session.mockResolvedValue({ data: { session: null }, error: null }); h.subscribe.mock.calls[0][0]("SIGNED_OUT", null); return { error: new Error("secret") }; });
    render(<AuthApprovalGate><LogoutButton>ログアウト</LogoutButton><span>Protected content</span></AuthApprovalGate>);
    await waitFor(() => expect(screen.getByRole("button", { name: "ログアウト" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "ログアウト" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    act(() => { window.dispatchEvent(new Event("focus")); h.subscribe.mock.calls[0][0]("SIGNED_OUT", null); });
    expect(h.leave).not.toHaveBeenCalled(); expect(h.replace).not.toHaveBeenCalled();
    expect(screen.queryByText("Protected content")).toBeNull(); expect(screen.getByRole("alert").textContent).not.toContain("secret");
    h.signOut.mockResolvedValue({ error: null }); fireEvent.click(screen.getByRole("button", { name: "ログアウトを再試行" }));
    await waitFor(() => expect(h.leave).toHaveBeenCalledOnce());
  });
});
