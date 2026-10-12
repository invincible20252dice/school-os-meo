// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TestReviewNotificationButton from "./TestReviewNotificationButton";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: session } }) }));
beforeEach(() => {
  session.mockResolvedValue({ data: { session: { access_token: "synthetic-session" } } });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "合成テスト完了" }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
it("sends bearer, selected school and unsaved LINE input", async () => {
  render(<TestReviewNotificationButton schoolId="school-b" lineChannelAccessToken="unsaved-token" lineDestinationId="unsaved-to" compact />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("合成テスト完了");
  expect(fetch).toHaveBeenCalledWith("/api/test/trigger-review", expect.objectContaining({
    headers: { "Content-Type": "application/json", authorization: "Bearer synthetic-session" },
    body: JSON.stringify({ schoolId: "school-b", lineChannelAccessToken: "unsaved-token", lineDestinationId: "unsaved-to" }),
  }));
});
it.each(["", "all"])("does not send without a single school (%s)", async schoolId => {
  render(<TestReviewNotificationButton schoolId={schoolId} compact />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("通知をテストする校舎を選択してください。");
  expect(fetch).not.toHaveBeenCalled();
});
it("does not send after session expiry", async () => {
  session.mockResolvedValue({ data: { session: null } });
  render(<TestReviewNotificationButton schoolId="school-a" compact />);
  fireEvent.click(screen.getByRole("button"));
  await screen.findByText("ログインしてください。");
  expect(fetch).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false));
});
