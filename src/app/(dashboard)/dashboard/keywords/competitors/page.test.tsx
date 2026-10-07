// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Page from "./page";
const state = vi.hoisted(() => ({ schoolId: "s1" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ schoolId: state.schoolId }) }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.schoolId = "s1"; });
it("adds, edits, reloads and deletes a custom district with confirmation", async () => {
  let items: Array<{ id: string; name: string; focusPoint: string; aiMessage: string }> = [];
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
    if (options.method === "POST") items = [{ id: "d1", ...JSON.parse(String(options.body)) }];
    if (options.method === "PATCH") items = [{ id: "d1", ...JSON.parse(String(options.body)) }];
    if (options.method === "DELETE") items = [];
    return Response.json({ success: true, districts: items });
  }); vi.stubGlobal("fetch", fetcher);
  render(<Page />); await screen.findByText("校区未登録");
  fireEvent.change(screen.getByLabelText("校区名"), { target: { value: "マリスト周辺" } });
  fireEvent.change(screen.getByLabelText("打ち出しポイント"), { target: { value: "自習室" } });
  fireEvent.change(screen.getByLabelText("地域向けメッセージ"), { target: { value: "個別対応" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" })); await screen.findByRole("button", { name: "編集" });
  expect(screen.getByText("自習室", { selector: "p" })).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "編集" }));
  fireEvent.change(screen.getByLabelText("校区名"), { target: { value: "帯山中" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" })); await screen.findByRole("option", { name: "帯山中" });
  fireEvent.click(screen.getByRole("button", { name: "削除" }));
  expect(fetcher.mock.calls.some(call => call[1].method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "削除を確定" })); await screen.findByText("校区未登録");
  expect(fetcher.mock.calls.every(call => call[0].includes("schoolId=s1"))).toBe(true);
});
it("does not load all-school records", () => { state.schoolId = "all"; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher); render(<Page />); expect(screen.getByText(/校舎を選択/)).toBeDefined(); expect(fetcher).not.toHaveBeenCalled(); });
it("preserves input after save failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ success: true, districts: [] })).mockResolvedValue(Response.json({ success: false, error: "重複しています" }, { status: 409 })));
  render(<Page />); await screen.findByText("校区未登録");
  fireEvent.change(screen.getByLabelText("校区名"), { target: { value: "帯山中" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByRole("alert"); expect((screen.getByLabelText("校区名") as HTMLInputElement).value).toBe("帯山中");
  await waitFor(() => expect((screen.getByRole("button", { name: "保存" }) as HTMLButtonElement).disabled).toBe(false));
});
