// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SupportChat from "./SupportChat";
const state = vi.hoisted(() => ({ loggedIn: true }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: state.loggedIn ? { access_token: "token" } : null } }) } }) }));
beforeEach(() => {
  state.loggedIn = true;
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function open() { render(<SupportChat />); fireEvent.click(screen.getByRole("button", { name: "使い方を聞く" })); }
it("opens, focuses input, sends FAQ and closes without discarding conversation", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, reply: "案内本文" })); vi.stubGlobal("fetch", fetcher);
  open(); expect(document.activeElement).toBe(screen.getByLabelText("質問"));
  fireEvent.click(screen.getByRole("button", { name: "口コミ返信" }));
  await screen.findByText("案内本文");
  expect(fetcher).toHaveBeenCalledWith("/api/support/chat", expect.objectContaining({ body: JSON.stringify({ message: "口コミ返信" }), headers: expect.objectContaining({ authorization: "Bearer token" }) }));
  fireEvent.click(screen.getByRole("button", { name: "ヘルプを閉じる" }));
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "使い方を聞く" }));
  fireEvent.click(screen.getByRole("button", { name: "使い方を聞く" }));
  expect(screen.getByText("案内本文")).toBeDefined();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("ignores blank submissions and prevents duplicate sends", async () => {
  let finish!: (value: Response) => void;
  const fetcher = vi.fn().mockReturnValue(new Promise(resolve => { finish = resolve; })); vi.stubGlobal("fetch", fetcher);
  open(); const input = screen.getByLabelText("質問"); const form = input.closest("form")!;
  fireEvent.submit(form); expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "アンケート" } }); fireEvent.submit(form); fireEvent.submit(form);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("status").textContent).toContain("取得");
  await act(async () => finish(Response.json({ success: true, reply: "保存方法" })));
  expect((input as HTMLTextAreaElement).value).toBe("");
});
it.each([
  [false, null, "ログイン"],
  [true, new Error("接続失敗"), "接続失敗"],
  [true, "offline", "通信に失敗"],
  [true, { success: false, error: "認証エラー" }, "認証エラー"],
  [true, { success: true, reply: 12 }, "回答を取得できません"],
])("keeps input on error (%s / %s)", async (loggedIn, result, expected) => {
  state.loggedIn = loggedIn;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => { if (result instanceof Error || typeof result === "string") throw result; return Response.json(result); }));
  open(); fireEvent.change(screen.getByLabelText("質問"), { target: { value: "質問本文" } });
  fireEvent.click(screen.getByRole("button", { name: "送信" }));
  expect((await screen.findByRole("alert")).textContent).toContain(expected);
  expect((screen.getByLabelText("質問") as HTMLTextAreaElement).value).toBe("質問本文");
});
