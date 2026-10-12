// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import Preview from "./instagram-sync-preview";
import { buildMockInstagramSyncPreview, DEFAULT_INSTAGRAM_LOCATION } from "@/lib/mock-instagram-sync";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: session } }) }));
async function data(name: string) {
  return { dashboardData: { location: DEFAULT_INSTAGRAM_LOCATION, instagramSetting: null },
    preview: await buildMockInstagramSyncPreview({ school: { id: name, name, gbpLocationId: "" } }) };
}
beforeEach(() => { session.mockResolvedValue({ data: { session: { access_token: "synthetic" } } }); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
it("does not fetch preview without a session", async () => {
  session.mockResolvedValue({ data: { session: null } }); render(<Preview schoolId="school-a" />);
  await screen.findByText("ログインしてください。"); expect(fetch).not.toHaveBeenCalled();
});
it("requests exact school with bearer and renders local preview", async () => {
  vi.mocked(fetch).mockResolvedValue(Response.json(await data("Synthetic A")));
  render(<Preview schoolId="school-a" />); await screen.findByText("Synthetic A", { exact: true });
  expect(fetch).toHaveBeenCalledWith("/api/instagram/preview?schoolId=school-a", expect.objectContaining({ headers: { authorization: "Bearer synthetic" }, signal: expect.any(AbortSignal) }));
});
it("clears old preview after school switch and displays denial", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(Response.json(await data("Synthetic A"))).mockResolvedValueOnce(Response.json({ message: "担当校ではありません。" }, { status: 403 }));
  const view = render(<Preview schoolId="school-a" />); await screen.findByText("Synthetic A", { exact: true });
  view.rerender(<Preview schoolId="school-b" />); expect(screen.queryByText("Synthetic A", { exact: true })).toBeNull();
  await screen.findByText("担当校ではありません。");
});
it("ignores stale responses after a newer selected school finishes", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(Response.json(await data("Synthetic B")));
  const view = render(<Preview schoolId="school-a" />); await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  view.rerender(<Preview schoolId="school-b" />); await screen.findByText("Synthetic B", { exact: true });
  const stale = Response.json(await data("Synthetic A")); await act(async () => finish(stale));
  expect(screen.queryByText("Synthetic A", { exact: true })).toBeNull(); expect(screen.getByText("Synthetic B", { exact: true })).toBeTruthy();
});

it.each([
  [true, null, "最終同期日時を取得できません（サンプル表示）"],
  [false, null, "最終同期日時の記録はありません（サンプル表示）"],
  [false, { lastSyncedAt: "2026-01-01T00:00:00.000Z" }, "最終同期 2026-01-01"],
])("distinguishes unavailable, unrecorded and known timestamps", async (syncTimestampUnavailable, instagramSetting, label) => {
  const body = await data("Synthetic A");
  vi.mocked(fetch).mockResolvedValue(Response.json({ ...body,
    dashboardData: { ...body.dashboardData, syncTimestampUnavailable, instagramSetting },
  }));
  render(<Preview schoolId="school-a" />);
  await screen.findByText(label as string);
});
