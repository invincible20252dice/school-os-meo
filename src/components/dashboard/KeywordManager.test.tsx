// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import KeywordManager from "./KeywordManager";
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) } }) }));
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); }; HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); }; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("manages keywords without navigation and refreshes parent after add/delete", async () => {
  let keywords: Array<{ id: string; keyword: string; location: string }> = [];
  const fetcher = vi.fn(async (_url: string, options: RequestInit) => { if (options.method === "POST") keywords = [{ id: "k1", ...JSON.parse(String(options.body)) }]; if (options.method === "DELETE") keywords = []; return Response.json({ success: true, keywords }); });
  vi.stubGlobal("fetch", fetcher); const changed = vi.fn(); render(<KeywordManager schoolId="s1" onChanged={changed} />);
  fireEvent.click(screen.getByRole("button", { name: "キーワード管理" })); await screen.findByText("登録済みキーワードはありません。");
  for (const [name, value] of [["キーワード", "熊本 英語塾"], ["計測地点", "熊本駅"], ["市町村", "熊本市"], ["最寄り駅", "熊本駅"]]) fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "追加" })); await screen.findByText("熊本 英語塾 / 熊本駅");
  expect(changed).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "削除" })); expect(fetcher.mock.calls.some(call => call[1].method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "削除を確定" })); await screen.findByText("登録済みキーワードはありません。"); expect(changed).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls.every(call => call[0].includes("schoolId=s1"))).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "閉じる" })); expect(screen.queryByRole("dialog")).toBeNull();
});
it("shows API errors instead of navigating away", async () => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ success: false, error: "権限がありません" }, { status: 403 }))); render(<KeywordManager schoolId="s1" onChanged={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "キーワード管理" })); expect((await screen.findByRole("alert")).textContent).toBe("権限がありません"); });
