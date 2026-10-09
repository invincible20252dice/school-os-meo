// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GoogleResultsClient from "./google-results-client";
import { aggregateLeadLifecycle } from "@/lib/google-lead-lifecycle";
import { aggregateLeads, leadPeriod } from "@/lib/google-leads";
const mocks = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=a"), session: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: mocks.session } }) }));
const now = new Date("2026-10-03T12:00:00Z");
const row = { id: "r", channel: "line", grade: null, status: "inquiry", occurredAt: "2026-10-01T00:00:00Z", version: 1 };
const results = (recent: object[] = [row]) => ({ success: true, school: { id: "a", name: "校舎A" }, ...aggregateLeads([], leadPeriod("month", now)), lifecycle: aggregateLeadLifecycle([], leadPeriod("month", now)), recent });
const metrics = (state = "available", extra = {}) => ({ success: true, data: { state, websiteClicks: 0, phoneClicks: 7, updatedAt: now.toISOString(), from: "2026-10-01", to: "2026-10-02", measuredDays: 2, ...extra } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let current: ReturnType<typeof results>;
let perf: ReturnType<typeof metrics>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.params = new URLSearchParams("schoolId=a");
  current = results(); perf = metrics();
  mocks.session.mockResolvedValue({ data: { session: { access_token: "token" } } });
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.includes("/performance?")) return response(perf);
    if (init.method === "GET") return response(current);
    return response({ success: true, lead: row });
  });
  vi.stubGlobal("fetch", mocks.fetch);
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const loaded = async () => { await screen.findByText("校舎A"); };
const mutation = () => mocks.fetch.mock.calls.filter(([, init]) => init.method !== "GET").map(([, init]) => ({ ...init, body: JSON.parse(init.body) }));
it("shows real zero vs unavailable, cohorts, 6 months and refresh/period requests", async () => {
  current = { ...results(), inquiriesCount: 8, meetingsCount: 5, meetingRate: 62.5, convertedCount: 5, previousMeetings: 3, currentMeetings: 5, meetingDiff: 2, lifecycle: { ...results().lifecycle, heldRate: 62.5 } };
  render(<GoogleResultsClient />); await loaded();
  expect(screen.getByText("62.5%")).toBeTruthy(); expect(screen.getByText("今月の面談実施")).toBeTruthy();
  expect(within(screen.getByText("Webサイトクリック")).getByText("0件")).toBeTruthy();
  expect(screen.getAllByRole("row")).toHaveLength(7);
  fireEvent.change(screen.getByLabelText("集計期間"), { target: { value: "previous" } }); await loaded();
  expect(mocks.fetch.mock.calls.some(([url]) => url.endsWith("period=previous"))).toBe(true);
  fireEvent.change(screen.getByLabelText("集計期間"), { target: { value: "six" } }); await loaded();
  fireEvent.click(screen.getByText("再取得")); await loaded();
  expect(mocks.fetch.mock.calls.some(([url]) => url.endsWith("period=six"))).toBe(true);
});
it.each([["LINE", "line"], ["電話", "phone"], ["Web", "web"]])("records %s in one click and leaves grade optional", async (label, channel) => {
  render(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText(label + " +1"));
  await screen.findByText("学年を追加しますか？（任意）");
  expect(mutation()[0].body).toEqual({ channel, idempotencyKey: expect.any(String) });
  expect(await screen.findByText(label + "経由の問い合わせを1件記録しました。")).toBeTruthy();
  fireEvent.click(screen.getByText("あとで"));
  expect(screen.queryByText("学年を追加しますか？（任意）")).toBeNull();
});
it("sets grade after registration and updates meeting/lost inline", async () => {
  render(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("学年を追加しますか？（任意）");
  fireEvent.click(screen.getByText("高校生")); await screen.findByText("問い合わせ記録を更新しました。");
  expect(mutation()[1].body).toEqual({ id: "r", version: 1, grade: "high_school" });
  fireEvent.click(screen.getByText("面談予定にする")); await waitFor(() => expect(mutation()).toHaveLength(3));
  await screen.findByText("問い合わせ記録を更新しました。");
  expect(mutation()[2].body.stage).toBe("scheduled");
  fireEvent.click(screen.getByText("⋯"));
  fireEvent.click(screen.getByText("見送り")); await waitFor(() => expect(mutation()).toHaveLength(4));
  expect(mutation()[3].body.stage).toBe("lost");
});
it("confirms deletion before soft-delete request, can cancel, and edits the record", async () => {
  render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("⋯"));
  fireEvent.click(screen.getByText("削除")); expect(mutation()).toHaveLength(0);
  fireEvent.click(screen.getByText("キャンセル")); expect(screen.queryByText("この問い合わせ記録を削除しますか？")).toBeNull();
  fireEvent.click(screen.getByText("編集"));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("経路"), { target: { value: "web" } });
  fireEvent.change(within(dialog).getByLabelText("学年"), { target: { value: "junior_high" } });
  fireEvent.change(within(dialog).getByLabelText("状態"), { target: { value: "scheduled" } });
  fireEvent.change(within(dialog).getByLabelText("問い合わせ日時（日本時間）"), { target: { value: "2026-09-30T10:00" } });
  fireEvent.submit(within(dialog).getByText("保存").closest("form")!);
  await screen.findByText("問い合わせ記録を更新しました。");
  expect(mutation()[0].body).toMatchObject({ channel: "web", grade: "junior_high", stage: "scheduled", occurredAt: "2026-09-30T10:00:00+09:00" });
  fireEvent.click(screen.getByText("削除"));
  fireEvent.click(screen.getByText("削除する")); await screen.findByText("問い合わせ記録を削除しました。");
  expect(mutation()[1]).toMatchObject({ method: "DELETE", body: { id: "r", version: 1 } });
});
it("supports clearing optional grade, cancel and empty datetime without crashing", async () => {
  current = results([{ ...row, grade: "high_school", status: "meeting" }, { ...row, id: "lost", status: "lost" }]);
  render(<GoogleResultsClient />); await loaded();
  expect(screen.queryByText("面談予定にする")).toBeNull();
  fireEvent.click(screen.getAllByText("⋯")[0]); fireEvent.click(screen.getAllByText("編集")[0]);
  fireEvent.change(screen.getByLabelText("学年"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("問い合わせ日時（日本時間）"), { target: { value: "" } });
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it.each(["disconnected", "unavailable", "error", "stale"])("keeps inquiry controls available while metrics are %s", async state => {
  perf = metrics(state, { websiteClicks: null, phoneClicks: null, updatedAt: null });
  current = results([]);
  render(<GoogleResultsClient />); await loaded();
  expect(await screen.findAllByText("未取得")).toHaveLength(2);
  expect((screen.getByText("LINE +1") as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/まだGoogle経由/)).toBeTruthy();
  if (state === "disconnected") expect(screen.getByText("Google連携を確認").getAttribute("href")).toContain("schoolId=a");
  if (state === "stale") expect(screen.getByText(/前回取得した値/)).toBeTruthy();
});
it("allows inquiry registration before slow metrics finish", async () => {
  let finish!: (value: Response) => void;
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => url.includes("performance") ? new Promise<Response>(resolve => { finish = resolve; }) : response(init.method === "GET" ? current : { success: true, lead: row }));
  render(<GoogleResultsClient />); await loaded();
  expect(screen.getByText("Google指標を確認しています…")).toBeTruthy();
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("学年を追加しますか？（任意）");
  await act(async () => finish(response(perf)));
  expect(screen.getByText("7件")).toBeTruthy();
});
it("shows login, missing-school and retrieval failures with retry", async () => {
  mocks.params = new URLSearchParams();
  const view = render(<GoogleResultsClient />);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "ヘッダーで対象の校舎を選択してください。");
  expect(mocks.fetch).not.toHaveBeenCalled();
  mocks.params = new URLSearchParams("schoolId=all"); view.rerender(<GoogleResultsClient />);
  mocks.params = new URLSearchParams("schoolId=a"); mocks.session.mockResolvedValue({ data: { session: null } }); view.rerender(<GoogleResultsClient />);
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", "ログイン後にGoogle集客成果を確認してください。");
  mocks.session.mockResolvedValue({ data: { session: { access_token: "t" } } });
  mocks.fetch.mockResolvedValue(response({ success: false }, 503));
  fireEvent.click(screen.getByText("再取得"));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("取得・保存できません"));
});
it("prevents double-clicks and reuses request key after ambiguous network failure", async () => {
  let reject!: (value: Error) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Promise((_resolve, fail) => { reject = fail; }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText("LINE +1")); fireEvent.click(screen.getByText("LINE +1"));
  await waitFor(() => expect(mutation()).toHaveLength(1));
  await act(async () => reject(new Error("通信失敗")));
  expect(screen.getByText("通信失敗")).toBeTruthy();
  mocks.fetch.mockImplementation(normal);
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("学年を追加しますか？（任意）");
  expect(mutation()[0].body.idempotencyKey).toBe(mutation()[1].body.idempotencyKey);
});
it.each(["POST", "PATCH", "DELETE"])("invalidates stale results after saved %s and failed GET, then retries only the read", async method => {
  render(<GoogleResultsClient />); await loaded();
  mocks.fetch.mockImplementation(async (_url, init) => response(init.method === method ? { success: true, lead: row } : { success: false, error: "取得失敗" }, init.method === method ? 200 : 503));
  if (method === "POST") fireEvent.click(screen.getByText("LINE +1"));
  else if (method === "PATCH") fireEvent.click(screen.getByText("面談予定にする"));
  else { fireEvent.click(screen.getByText("⋯")); fireEvent.click(screen.getByText("削除")); fireEvent.click(screen.getByText("削除する")); }
  expect(await screen.findByText("保存済みですが一覧を再取得できませんでした。再取得してください。")).toBeTruthy();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByRole("region", { name: "実際の成果" })).toBeNull();
  expect(screen.queryByText("LINE +1")).toBeNull();
  expect(screen.queryByText("面談予定にする")).toBeNull();
  current = { ...results([]), inquiriesCount: 1, meetingsCount: 1, convertedCount: 1, meetingRate: 100, lifecycle: { ...results().lifecycle, heldRate: 100 } };
  mocks.fetch.mockImplementation(async url => response(url.includes("performance") ? perf : current));
  fireEvent.click(screen.getByText("再取得"));
  expect(await screen.findByText("100%")).toBeTruthy();
  expect(mutation()).toHaveLength(1);
});
it("hides obsolete results while the post-save read is pending and ignores its failure after a school switch", async () => {
  const view = render(<GoogleResultsClient />); await loaded();
  const normal = mocks.fetch.getMockImplementation()!;
  let failRead!: (error: Error) => void;
  mocks.fetch.mockImplementation((url, init) => init.method === "PATCH" ? response({ success: true }) : new Promise((_resolve, reject) => { failRead = reject; }));
  fireEvent.click(screen.getByText("面談予定にする"));
  await waitFor(() => expect(screen.queryByRole("region", { name: "実際の成果" })).toBeNull());
  expect(screen.getByText("成果を読み込んでいます…")).toBeTruthy();
  expect(screen.queryByText("LINE +1")).toBeNull();
  mocks.fetch.mockImplementation(normal);
  mocks.params = new URLSearchParams("schoolId=b"); current = { ...results([]), school: { id: "b", name: "校舎B" } };
  view.rerender(<GoogleResultsClient />); await screen.findByText("校舎B");
  await act(async () => failRead(new Error("old read failed")));
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("校舎B")).toBeTruthy();
});
it("ignores obsolete school responses and mutation completion after switch", async () => {
  let complete!: (value: Response) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Promise(resolve => { complete = resolve; }) : normal(url, init));
  const view = render(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mutation()).toHaveLength(1));
  mocks.params = new URLSearchParams("schoolId=b"); current = { ...results([]), school: { id: "b", name: "校舎B" } };
  view.rerender(<GoogleResultsClient />); await screen.findByText("校舎B");
  await act(async () => complete(response({ success: true, lead: row })));
  expect(screen.queryByText("学年を追加しますか？（任意）")).toBeNull();
  expect(screen.queryByText("校舎A")).toBeNull();
});
it("distinguishes planned, held, enrolled and unknown legacy meetings with explicit actions", async () => {
  current = { ...results([
    { ...row, id: "planned", status: "meeting", meetingScheduledAt: now.toISOString() },
    { ...row, id: "held", status: "meeting", meetingHeldAt: now.toISOString() },
    { ...row, id: "enrolled", status: "meeting", meetingHeldAt: now.toISOString(), enrolledAt: now.toISOString() },
    { ...row, id: "legacy", status: "meeting" },
  ]), lifecycle: { ...results().lifecycle, legacyMeetingCount: 1, enrollmentRate: 25 } };
  render(<GoogleResultsClient />); await loaded();
  expect(screen.getByText(/旧面談 1件は予定・実施が未確認/)).toBeTruthy();
  expect(screen.getByText("25%")).toBeTruthy();
  for (const [label, stage] of [["実施を記録", "held"], ["入塾を記録", "enrolled"], ["面談予定を確認", "scheduled"], ["面談実施を確認", "held"]]) {
    fireEvent.click(screen.getByText(label));
    await screen.findByText("問い合わせ記録を更新しました。");
    expect(mutation().at(-1)?.body.stage).toBe(stage);
  }
  const enrolled = screen.getAllByRole("listitem")[2];
  expect(within(enrolled).getByText("見送り")).toHaveProperty("disabled", true);
  fireEvent.click(within(enrolled).getByText("編集"));
  fireEvent.change(screen.getByLabelText("状態"), { target: { value: "inquiry" } });
  expect(screen.getByText(/記録日時を取り消します/)).toBeTruthy();
  fireEvent.submit(screen.getByText("保存").closest("form")!);
  await screen.findByText("問い合わせ記録を更新しました。");
  expect(mutation().at(-1)?.body).toMatchObject({ id: "enrolled", stage: "inquiry" });
});
