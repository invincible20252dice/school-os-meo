// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import InstagramRealSyncButton from "./InstagramRealSyncButton";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: session } }) }));
beforeEach(() => {
  session.mockResolvedValue({ data: { session: { access_token: "synthetic-session" } } });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, message: "合成同期完了", summary: { posted: 1 } })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
it.each(["school-a", "all", ""])("sends session bearer while preserving requested scope %s", async schoolId => {
  render(<InstagramRealSyncButton schoolId={schoolId} />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText(/合成同期完了/);
  expect(fetch).toHaveBeenCalledWith(`/api/instagram/sync${schoolId ? `?schoolId=${schoolId}` : ""}`, {
    method: "POST", headers: { authorization: "Bearer synthetic-session" },
  });
});
it("does not send on expired session", async () => {
  session.mockResolvedValue({ data: { session: null } });
  render(<InstagramRealSyncButton schoolId="school-a" />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("ログインしてください。"); expect(fetch).not.toHaveBeenCalled();
});
it("shows unavailable without rendering internal diagnostics", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: false, code: "SYNC_UNAVAILABLE", message: "同期利用不可。設定を確認してから再度お試しください。" }, { status: 503 }));
  render(<InstagramRealSyncButton schoolId="school-a" />); fireEvent.click(screen.getByRole("button"));
  await screen.findByText("同期利用不可。設定を確認してから再度お試しください。");
  expect(screen.queryByText(/SYNC_UNAVAILABLE/)).toBeNull();
});
it("does not call a zero-post response real sync success even with a legacy success message", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json({ ok: true, message: "Instagram実同期を実行しました。", summary: { posted: 0 } }));
  render(<InstagramRealSyncButton schoolId="school-a" />); fireEvent.click(screen.getByRole("button"));
  await screen.findByText("実投稿はありません（0件）。");
  expect(screen.queryByText(/実同期を実行しました/)).toBeNull();
});
