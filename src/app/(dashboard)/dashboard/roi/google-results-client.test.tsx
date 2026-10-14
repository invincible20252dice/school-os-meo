// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import GoogleResultsClient from "./google-results-client";
import { createLeadOperationKey } from "@/lib/google-lead-operation-key";
import type { LeadRecoveryOperation, LeadRecoveryScope } from "@/lib/google-lead-recovery-storage";
import { aggregateLeadLifecycle } from "@/lib/google-lead-lifecycle";
import { aggregateLeads, leadPeriod } from "@/lib/google-leads";
const mocks = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=a"), session: vi.fn(), fetch: vi.fn(), pathname: "/dashboard/roi", authChange: null as null | ((event: string, session: { user: { id: string } } | null) => void), operations: [] as LeadRecoveryOperation[], storageOK: true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params, usePathname: () => mocks.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: mocks.session, onAuthStateChange: (cb: typeof mocks.authChange) => { mocks.authChange = cb; return { data: { subscription: { unsubscribe: vi.fn() } } }; } } }) }));
vi.mock("@/lib/google-lead-recovery-storage", () => ({
  LEAD_RECOVERY_CHANGED: "lead-recovery-test",
  readLeadRecovery: (scope: LeadRecoveryScope) => ({ ok: mocks.storageOK, operations: mocks.operations.filter(op => op.userId === scope.userId && op.schoolId === scope.schoolId && op.route === scope.route && Date.now() - op.startedAt < 86400000) }),
  pruneLeadRecovery: (scope: Partial<LeadRecoveryScope>) => { mocks.operations = mocks.operations.filter(op => Object.entries(scope).every(([k, v]) => op[k as keyof LeadRecoveryOperation] === v)); return mocks.storageOK; },
  saveLeadRecovery: (op: LeadRecoveryOperation) => { if (!mocks.storageOK) return false; mocks.operations.push(op); return true; },
  updateLeadRecovery: (id: string, state: LeadRecoveryOperation["state"]) => { const op = mocks.operations.find(op => op.operationId === id); if (!op || !mocks.storageOK) return false; op.state = state; return true; },
  dropLeadRecovery: (id: string) => { if (!mocks.storageOK) return false; mocks.operations = mocks.operations.filter(op => op.operationId !== id); return true; },
}));
const userId = "11111111-1111-4111-8111-111111111111";
const otherUser = "22222222-2222-4222-8222-222222222222";
const authSession = (id = userId) => ({ data: { session: { access_token: "token", user: { id } } } });
const seedOperation = (channel: "line" | "phone" = "line", extra = {}) => {
  const op = { userId, schoolId: "a", route: "/dashboard/roi", operationId: createLeadOperationKey(userId, channel, crypto.randomUUID()), startedAt: Date.now(), state: "response_unknown" as const, ...extra };
  mocks.operations.push(op); return op;
};
const now = new Date("2026-10-03T12:00:00Z");
const row = { id: "r", channel: "line", grade: null, status: "inquiry", occurredAt: "2026-10-01T00:00:00Z", version: 1 };
const results = (recent: object[] = [row]) => ({ success: true, school: { id: "a", name: "校舎A" }, ...aggregateLeads([], leadPeriod("month", now)), lifecycle: aggregateLeadLifecycle([], leadPeriod("month", now)), recent });
const metrics = (state = "available", extra = {}) => ({ success: true, data: { state, websiteClicks: 0, phoneClicks: 7, updatedAt: now.toISOString(), from: "2026-10-01", to: "2026-10-02", measuredDays: 2, ...extra } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
let current: ReturnType<typeof results>;
let perf: ReturnType<typeof metrics>;
beforeEach(() => {
  vi.clearAllMocks(); mocks.params = new URLSearchParams("schoolId=a"); mocks.pathname = "/dashboard/roi"; mocks.operations = []; mocks.storageOK = true;
  current = results(); perf = metrics();
  mocks.session.mockResolvedValue(authSession());
  mocks.fetch.mockImplementation(async (url: string, init: RequestInit) => {
    if (url.includes("/operation-status?")) return response({ success: true, state: "absent" });
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
  mocks.session.mockResolvedValue(authSession());
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
  fireEvent.click(screen.getByText("前回の登録状態を確認")); await screen.findByText("前回の登録を再試行");
  fireEvent.click(screen.getByText("前回の登録を再試行")); await screen.findByText("学年を追加しますか？（任意）");
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


const waitIdle = async () => waitFor(() => expect((screen.getByText("LINE +1") as HTMLButtonElement).disabled).toBe(false));
const unknownPost = async () => {
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? Promise.reject(new Error("応答不明")) : normal(url, init));
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("応答不明");
  return normal;
};
it("reload only queries absent status and explicit retry preserves the original identity and timestamp", async () => {
  const op = seedOperation();
  render(<GoogleResultsClient />); await loaded();
  await screen.findByText("前回の登録を再試行");
  expect(mutation()).toHaveLength(0);
  expect(mocks.fetch.mock.calls.some(([url]) => url.includes(`operationId=${op.operationId}`))).toBe(true);
  fireEvent.click(screen.getByText("前回の登録を再試行"));
  await screen.findByText("前回の問い合わせ登録を完了しました。");
  expect(mutation()[0].body).toEqual({ channel: "line", idempotencyKey: op.operationId });
  expect(mocks.operations).toEqual([]);
});
it.each(["saved", "changed", "deleted"])("reload resolves %s truthfully without a POST", async state => {
  seedOperation();
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => url.includes("operation-status") ? response({ success: true, state }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded();
  const text = state === "saved" ? "前回の問い合わせは保存済みです。重複登録していません。" : state === "changed" ? "前回の問い合わせは保存後に変更されています。追加登録していません。" : "前回の問い合わせは保存後に削除されています。再登録していません。";
  await screen.findByText(text); expect(mutation()).toHaveLength(0); expect(mocks.operations).toEqual([]);
});
it("keeps confirmed metadata after POST succeeds and list read fails, including failed reload status", async () => {
  const view = render(<GoogleResultsClient />); await loaded();
  mocks.fetch.mockImplementation(async (_url, init) => response(init.method === "POST" ? { success: true, lead: row } : { success: false }, init.method === "POST" ? 200 : 503));
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("保存済みですが一覧を再取得できませんでした。再取得してください。");
  expect(mocks.operations[0].state).toBe("confirmed");
  const original = mocks.operations[0].operationId;
  view.unmount(); render(<GoogleResultsClient />);
  await screen.findByText("登録状態を確認できません");
  expect(mocks.operations[0].operationId).toBe(original);
  expect(mutation()).toHaveLength(1);
  expect(screen.queryByRole("region", { name: "実際の成果" })).toBeNull();
  expect(screen.queryByText("前回の登録を再試行")).toBeNull();
});
it.each(["saved", "changed", "deleted"])("POST 409 looks up %s state instead of resubmitting", async state => {
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? response({ error: "競合" }, 409) : url.includes("operation-status") ? response({ success: true, state }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("LINE +1"));
  await waitFor(() => expect(mocks.operations).toEqual([])); await waitIdle();
  expect(mutation()).toHaveLength(1);
  expect(screen.queryByText("競合")).toBeNull();
});
it.each(["absent", "invalid", "failed", "nonjson"])("unknown 409 (%s) remains unresolved and never sends automatically", async state => {
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Response("conflict", { status: 409 }) : url.includes("operation-status") ? state === "nonjson" ? new Response("oops", { status: 503 }) : response({ success: state !== "failed", state }, state === "failed" ? 503 : 200) : normal(url, init));
  render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("LINE +1"));
  await screen.findByText("登録状態を確認できません"); await waitIdle();
  expect(mocks.operations).toHaveLength(1); expect(mutation()).toHaveLength(1);
  expect(screen.queryByText("前回の登録を再試行")).toBeNull();
});
it("new +1 asks before a second POST; cancel and check-previous choices do not register", async () => {
  render(<GoogleResultsClient />); await loaded(); const normal = await unknownPost();
  fireEvent.click(screen.getByText("電話 +1"));
  expect(screen.getByRole("dialog", { name: "新しい問い合わせの確認" })).toBeTruthy();
  expect(mutation()).toHaveLength(1);
  fireEvent.click(screen.getByText("キャンセル")); expect(mocks.operations).toHaveLength(1);
  fireEvent.click(screen.getByText("電話 +1"));
  fireEvent(screen.getByRole("dialog", { name: "新しい問い合わせの確認" }), new Event("cancel", { bubbles: true, cancelable: true }));
  expect(mutation()).toHaveLength(1);
  mocks.fetch.mockImplementation(normal);
  fireEvent.click(screen.getByText("電話 +1")); fireEvent.click(screen.getByText("前回の登録状態を確認する"));
  await screen.findByText("前回の登録を再試行"); expect(mutation()).toHaveLength(1);
  fireEvent.click(screen.getByText("電話 +1")); fireEvent.click(screen.getByText("新しい問い合わせとして登録する"));
  await screen.findByText("電話経由の問い合わせを1件記録しました。");
  expect(mutation()[1].body.idempotencyKey).not.toBe(mutation()[0].body.idempotencyKey);
  expect(mocks.operations).toHaveLength(1);
  fireEvent.click(screen.getByText("前回の登録を再試行")); await screen.findByText("前回の問い合わせ登録を完了しました。");
  expect(mutation()[2].body.idempotencyKey).toBe(mutation()[0].body.idempotencyKey);
});
it("keeps multiple unknown operations distinct and cancels only the selected one", async () => {
  render(<GoogleResultsClient />); await loaded(); await unknownPost();
  const first = mocks.operations[0];
  fireEvent.click(screen.getByText("電話 +1")); fireEvent.click(screen.getByText("新しい問い合わせとして登録する"));
  await waitFor(() => expect(mutation()).toHaveLength(2)); await waitIdle();
  expect(mocks.operations).toHaveLength(2);
  expect(new Set(mocks.operations.map(op => op.operationId)).size).toBe(2);
  fireEvent.click(within(screen.getByRole("article", { name: "LINEの未確認登録 1" })).getByText("この操作の再確認をやめる"));
  expect(mocks.operations).toHaveLength(1); expect(mocks.operations[0].operationId).not.toBe(first.operationId);
  expect(screen.getByText("この操作の再確認を終了しました。すでに保存された問い合わせは削除されません。")).toBeTruthy();
});
it("does not overwrite a pending key when school changes, and ignores its late conflict", async () => {
  let complete!: (response: Response) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Promise<Response>(resolve => { complete = resolve; }) : normal(url, init));
  const view = render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mutation()).toHaveLength(1));
  const oldKey = mutation()[0].body.idempotencyKey;
  mocks.params = new URLSearchParams("schoolId=b"); current = { ...results(), school: { id: "b", name: "校舎B" } }; view.rerender(<GoogleResultsClient />); await screen.findByText("校舎B");
  expect(mocks.operations).toEqual([]);
  await act(async () => complete(response({ success: false, error: "古い競合" }, 409)));
  expect(screen.queryByText("古い競合")).toBeNull();
  mocks.fetch.mockImplementation(normal); mocks.params = new URLSearchParams("schoolId=a"); current = results(); view.rerender(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("LINE経由の問い合わせを1件記録しました。");
  expect(mutation()[1].body.idempotencyKey).not.toBe(oldKey);
});
it.each(["route", "user", "logout"])("discards old operations during %s changes and ignores delayed POST", async change => {
  let complete!: (response: Response) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Promise<Response>(resolve => { complete = resolve; }) : normal(url, init));
  const view = render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mutation()).toHaveLength(1));
  if (change === "route") { mocks.pathname = "/dashboard"; view.rerender(<GoogleResultsClient />); }
  else { mocks.session.mockResolvedValue(change === "user" ? authSession(otherUser) : { data: { session: null } }); act(() => mocks.authChange!(change === "user" ? "SIGNED_IN" : "SIGNED_OUT", change === "user" ? { user: { id: otherUser } } : null)); }
  await waitFor(() => expect(mocks.operations).toEqual([]));
  await act(async () => complete(response({ success: true, lead: row })));
  expect(screen.queryByText("学年を追加しますか？（任意）")).toBeNull(); expect(mocks.operations).toEqual([]);
});
it("rechecks current session before POST and clears old identity even if an auth event was missed", async () => {
  render(<GoogleResultsClient />); await loaded(); mocks.session.mockResolvedValue(authSession(otherUser));
  fireEvent.click(screen.getByText("LINE +1"));
  await waitFor(() => expect(mocks.operations).toEqual([])); await loaded(); expect(mutation()).toHaveLength(0);
});
it("rechecks session before status lookup when an auth event was missed", async () => {
  seedOperation(); render(<GoogleResultsClient />); await screen.findByText("前回の登録を再試行");
  mocks.session.mockResolvedValue(authSession(otherUser)); fireEvent.click(screen.getByText("前回の登録状態を確認"));
  await waitFor(() => expect(mocks.operations).toEqual([])); expect(mutation()).toHaveLength(0);
});
it("period change keeps pending identity and performs read-only recovery", async () => {
  render(<GoogleResultsClient />); await loaded(); await unknownPost(); const op = mocks.operations[0];
  fireEvent.change(screen.getByLabelText("集計期間"), { target: { value: "previous" } });
  await screen.findByText("前回の登録を再試行");
  expect(mocks.operations[0].operationId).toBe(op.operationId); expect(mocks.operations[0].startedAt).toBe(op.startedAt);
  expect(mutation()).toHaveLength(1);
});
it("cancels a sending operation without allowing its delayed response to restore state", async () => {
  let complete!: (response: Response) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Promise<Response>(resolve => { complete = resolve; }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mutation()).toHaveLength(1));
  expect(screen.getByText("登録しています…")).toBeTruthy(); expect(screen.queryByText("登録状態を確認できません")).toBeNull();
  fireEvent.click(screen.getByText("この操作の再確認をやめる")); expect(mocks.operations).toEqual([]);
  await act(async () => complete(response({ success: true, lead: row })));
  expect(screen.queryByText("学年を追加しますか？（任意）")).toBeNull(); expect(mocks.operations).toEqual([]);
});
it("ignores a delayed status response after cancellation and preserves a newer operation", async () => {
  seedOperation(); let complete!: (response: Response) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => url.includes("operation-status") ? new Promise<Response>(resolve => { complete = resolve; }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded(); await screen.findByText("前回の登録状態を確認しています…");
  fireEvent.click(screen.getByText("この操作の再確認をやめる"));
  const normal2 = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? response({ success: false }, 503) : normal2(url, init));
  fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mutation()).toHaveLength(1)); await waitIdle();
  const op = mocks.operations[0]; await act(async () => complete(response({ success: true, state: "saved" })));
  expect(mocks.operations[0].operationId).toBe(op.operationId);
  expect(screen.queryByText("前回の問い合わせは保存済みです。重複登録していません。")).toBeNull();
});
it("external disposal while sending does not revive metadata on a failed response", async () => {
  let reject!: (error: Error) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? new Promise((_r, fail) => { reject = fail; }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded(); fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mutation()).toHaveLength(1));
  act(() => { mocks.operations = []; window.dispatchEvent(new Event("lead-recovery-test")); });
  await act(async () => reject(new Error("late failure")));
  expect(mocks.operations).toEqual([]); expect(screen.queryByText("late failure")).toBeNull(); await waitIdle();
});
it.each(["read", "save", "retry"])("storage refusal at %s stops POST visibly", async failure => {
  if (failure === "read") mocks.storageOK = false;
  if (failure === "retry") seedOperation();
  render(<GoogleResultsClient />); await loaded();
  if (failure !== "read") {
    if (failure === "retry") await screen.findByText("前回の登録を再試行");
    mocks.storageOK = false;
    fireEvent.click(screen.getByText(failure === "retry" ? "前回の登録を再試行" : "LINE +1"));
  }
  await screen.findByText(/このタブで登録操作を一時保存できない/); expect(mutation()).toHaveLength(0);
});
it.each([{ userId: otherUser }, { schoolId: "b" }, { route: "/other" }, { startedAt: Date.now() - 86400001 }])("does not restore mismatched or expired metadata %j", async extra => {
  seedOperation("line", extra); render(<GoogleResultsClient />); await loaded();
  expect(screen.queryByRole("region", { name: "前回の登録" })).toBeNull();
  expect(mocks.fetch.mock.calls.some(([url]) => url.includes("operation-status"))).toBe(false);
});
it("shows status-confirmed but list-unavailable without rendering zero or posting", async () => {
  seedOperation(); let listed = false;
  mocks.fetch.mockImplementation((url, init) => url.includes("performance") ? response(perf) : url.includes("operation-status") ? response({ success: true, state: "saved" }) : !listed ? (listed = true, response(current)) : response({ success: false }, 503));
  render(<GoogleResultsClient />);
  await screen.findByText("登録状態は確認できましたが一覧を再取得できませんでした。再取得してください。");
  expect(screen.queryByRole("region", { name: "実際の成果" })).toBeNull(); expect(mutation()).toHaveLength(0); expect(mocks.operations).toEqual([]);
});
it("handles non-Error auth, read and mutation failures with safe visible messages", async () => {
  mocks.session.mockRejectedValueOnce("unknown"); const view = render(<GoogleResultsClient />);
  await screen.findByText("ログイン状態を確認できませんでした。");
  fireEvent.click(screen.getByText("再取得")); await loaded();
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => init.method === "POST" ? Promise.reject(null) : normal(url, init));
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("保存できませんでした。再試行してください。");
  mocks.fetch.mockImplementation((url) => url.includes("performance") ? response(perf) : Promise.reject(null));
  fireEvent.click(screen.getByText("再取得")); await screen.findByText("一覧を取得できませんでした。");
  view.unmount();
});
it("ignores initial old getSession resolution after an account change while bootstrapping", async () => {
  let complete!: (value: ReturnType<typeof authSession>) => void;
  mocks.session.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  render(<GoogleResultsClient />);
  act(() => { mocks.session.mockResolvedValue(authSession(otherUser)); mocks.authChange!("SIGNED_IN", { user: { id: otherUser } }); });
  await loaded(); await act(async () => complete(authSession()));
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("LINE経由の問い合わせを1件記録しました。");
  expect(mutation()[0].body.idempotencyKey).toContain(otherUser.replaceAll("-", ""));
});
it("ignores INITIAL_SESSION before bootstrap, and same-user refresh preserves pending operation", async () => {
  let complete!: (value: ReturnType<typeof authSession>) => void;
  mocks.session.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  render(<GoogleResultsClient />);
  act(() => mocks.authChange!("INITIAL_SESSION", { user: { id: userId } }));
  await act(async () => complete(authSession())); await loaded();
  await unknownPost(); const op = mocks.operations[0];
  act(() => mocks.authChange!("TOKEN_REFRESHED", { user: { id: userId } }));
  expect(mocks.operations[0].operationId).toBe(op.operationId);
});
it("fresh session logout without an event clears metadata before POST and blocks registration", async () => {
  render(<GoogleResultsClient />); await loaded(); mocks.session.mockResolvedValue({ data: { session: null } });
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("ログイン後にGoogle集客成果を確認してください。");
  expect(mocks.operations).toEqual([]); expect(mutation()).toHaveLength(0);
});
it("clears retained metadata on initial signed-out reload", async () => {
  seedOperation(); mocks.session.mockResolvedValue({ data: { session: null } });
  render(<GoogleResultsClient />); await screen.findByText("ログイン後にGoogle集客成果を確認してください。");
  expect(mocks.operations).toEqual([]); expect(mocks.fetch).not.toHaveBeenCalled();
});
it("handles storage failure only at the before-POST write without sending", async () => {
  render(<GoogleResultsClient />); await loaded();
  const random = vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => { mocks.storageOK = false; return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; });
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText(/このタブで登録操作を一時保存できない/);
  expect(mutation()).toHaveLength(0); random.mockRestore();
});
it("stops before registration when a safe operation identity cannot be generated", async () => {
  render(<GoogleResultsClient />); await loaded();
  const random = vi.spyOn(crypto, "randomUUID").mockImplementationOnce(() => { throw new Error("unavailable"); });
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText(/このタブで登録操作を一時保存できない/);
  expect(mutation()).toHaveLength(0); random.mockRestore();
});
it.each(["cancel", "expiry", "external"].flatMap(reason => ["success", "failure"].map(outcome => [reason, outcome])))("%s during list refresh exposes explicit recovery and ignores late %s", async (reason, outcome) => {
  let complete!: (value: Response) => void, fail!: (error: Error) => void;
  render(<GoogleResultsClient />); await loaded();
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((_url, init) => init.method === "POST" ? response({ success: true, lead: row }) : new Promise<Response>((resolve, reject) => { complete = resolve; fail = reject; }));
  fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(mocks.operations[0]?.state).toBe("confirmed"));
  await waitFor(() => expect(complete).toBeDefined());
  if (reason === "cancel") fireEvent.click(screen.getByText("この操作の再確認をやめる"));
  else act(() => { if (reason === "expiry") mocks.operations[0].startedAt = Date.now() - 86400000; else mocks.operations = []; window.dispatchEvent(new Event("lead-recovery-test")); });
  expect(screen.queryByText("成果を読み込んでいます…")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("再取得");
  expect(screen.getByText("再取得")).toHaveProperty("disabled", false);
  expect(mocks.operations.filter(op => Date.now() - op.startedAt < 86400000)).toEqual([]); expect(mutation()).toHaveLength(1);
  await act(async () => { if (outcome === "success") complete(response({ ...current, school: { id: "a", name: "obsolete-list" } })); else fail(new Error("obsolete-failure")); });
  expect(screen.queryByText("obsolete-list")).toBeNull(); expect(screen.queryByText("obsolete-failure")).toBeNull();
  expect(screen.getByRole("alert").textContent).toContain("再取得");
  mocks.fetch.mockImplementation(normal);
  fireEvent.click(screen.getByText("再取得")); await loaded();
  expect(screen.getByText("LINE +1")).toHaveProperty("disabled", false);
  expect(screen.queryByRole("alert")).toBeNull(); expect(mocks.operations.filter(op => Date.now() - op.startedAt < 86400000)).toEqual([]); expect(mutation()).toHaveLength(1);
});
it.each(["school", "user"])("cancelled list response cannot overwrite a new %s context", async boundary => {
  let complete!: (value: Response) => void;
  const view = render(<GoogleResultsClient />); await loaded();
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((_url, init) => init.method === "POST" ? response({ success: true, lead: row }) : new Promise<Response>(resolve => { complete = resolve; }));
  fireEvent.click(screen.getByText("LINE +1")); await waitFor(() => expect(complete).toBeDefined());
  fireEvent.click(screen.getByText("この操作の再確認をやめる"));
  expect(screen.getByRole("alert").textContent).toContain("再取得");
  mocks.fetch.mockImplementation(normal); current = { ...current, school: { id: "b", name: "new-context" } };
  if (boundary === "school") { mocks.params = new URLSearchParams("schoolId=b"); view.rerender(<GoogleResultsClient />); }
  else { mocks.session.mockResolvedValue(authSession(otherUser)); act(() => mocks.authChange!("SIGNED_IN", { user: { id: otherUser } })); }
  await screen.findByText("new-context");
  await act(async () => complete(response({ ...current, school: { id: "a", name: "obsolete-list" } })));
  expect(screen.getByText("new-context")).toBeTruthy(); expect(screen.queryByText("obsolete-list")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull(); expect(mocks.operations).toEqual([]); expect(mutation()).toHaveLength(1);
});
it("ignores a delayed failed status refresh after route leaves", async () => {
  seedOperation(); let reject!: (error: Error) => void; let listReads = 0;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => url.includes("operation-status") ? response({ success: true, state: "saved" }) : !url.includes("performance") && ++listReads > 1 ? new Promise((_r, fail) => { reject = fail; }) : normal(url, init));
  const view = render(<GoogleResultsClient />); await screen.findByText("前回の問い合わせは保存済みです。重複登録していません。");
  mocks.pathname = "/dashboard"; mocks.fetch.mockImplementation(normal); view.rerender(<GoogleResultsClient />); await loaded();
  await act(async () => reject(new Error("obsolete")));
  expect(screen.queryByText("登録状態は確認できましたが一覧を再取得できませんでした。再取得してください。")).toBeNull();
});
it("cancellation during the pre-POST getSession wait prevents sending", async () => {
  render(<GoogleResultsClient />); await loaded();
  let complete!: (value: ReturnType<typeof authSession>) => void;
  mocks.session.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  fireEvent.click(screen.getByText("LINE +1")); await screen.findByText("この操作の再確認をやめる");
  fireEvent.click(screen.getByText("この操作の再確認をやめる"));
  await act(async () => complete(authSession()));
  expect(mutation()).toHaveLength(0); expect(mocks.operations).toEqual([]);
});
it("a canceled reload status queue cannot take over a newer in-flight registration", async () => {
  seedOperation(); seedOperation("phone");
  let finishCheck!: (value: Response) => void, finishPost!: (value: Response) => void;
  const normal = mocks.fetch.getMockImplementation()!;
  mocks.fetch.mockImplementation((url, init) => url.includes("operation-status") ? new Promise<Response>(resolve => { finishCheck = resolve; }) : init.method === "POST" ? new Promise<Response>(resolve => { finishPost = resolve; }) : normal(url, init));
  render(<GoogleResultsClient />); await loaded();
  await waitFor(() => expect(mocks.fetch.mock.calls.some(([url]) => url.includes("operation-status"))).toBe(true));
  fireEvent.click(within(screen.getByRole("article", { name: "LINEの未確認登録 1" })).getByText("この操作の再確認をやめる"));
  fireEvent.click(screen.getByText("Web +1")); fireEvent.click(screen.getByText("新しい問い合わせとして登録する"));
  await waitFor(() => expect(mutation()).toHaveLength(1));
  await act(async () => finishCheck(response({ success: true, state: "saved" })));
  expect(mocks.fetch.mock.calls.filter(([url]) => url.includes("operation-status"))).toHaveLength(1);
  expect(screen.getByText("Web +1")).toHaveProperty("disabled", true);
  await act(async () => finishPost(response({ success: true, lead: row })));
  await screen.findByText("Web経由の問い合わせを1件記録しました。");
  expect(mocks.operations).toHaveLength(1); expect(mocks.operations[0].operationId).toContain("_p_");
});
it.each([503, 409])("keeps failed PATCH %s feedback accessible inside the edit dialog", async status => {
  render(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText("⋯")); fireEvent.click(screen.getByText("編集"));
  const dialog = screen.getByRole("dialog", { name: "問い合わせの編集" });
  mocks.fetch.mockResolvedValue(response({ success: false, error: "編集を保存できませんでした" }, status));
  fireEvent.submit(within(dialog).getByText("保存").closest("form")!);
  expect(await within(dialog).findByRole("status")).toHaveProperty("textContent", "編集を保存できませんでした");
  expect(screen.getByRole("dialog", { name: "問い合わせの編集" })).toBe(dialog);
  expect(mutation()).toHaveLength(1); expect(mutation()[0].method).toBe("PATCH");
});
it.each([503, 409])("keeps failed DELETE %s feedback accessible inside the delete dialog", async status => {
  render(<GoogleResultsClient />); await loaded();
  fireEvent.click(screen.getByText("⋯")); fireEvent.click(screen.getByText("削除"));
  const dialog = screen.getByRole("dialog", { name: "問い合わせの削除" });
  mocks.fetch.mockResolvedValue(response({ success: false, error: "削除を完了できませんでした" }, status));
  fireEvent.click(within(dialog).getByText("削除する"));
  expect(await within(dialog).findByRole("status")).toHaveProperty("textContent", "削除を完了できませんでした");
  expect(screen.getByRole("dialog", { name: "問い合わせの削除" })).toBe(dialog);
  expect(mutation()).toHaveLength(1); expect(mutation()[0].method).toBe("DELETE");
});
it("distinguishes a same-key retry in progress from acknowledged save awaiting list refresh", async () => {
  const op = seedOperation(); render(<GoogleResultsClient />); await screen.findByText("前回の登録を再試行");
  let post!: (value: Response) => void, failList!: (error: Error) => void;
  mocks.fetch.mockImplementation((_url, init) => init.method === "POST" ? new Promise<Response>(resolve => { post = resolve; }) : new Promise<Response>((_resolve, reject) => { failList = reject; }));
  fireEvent.click(screen.getByText("前回の登録を再試行")); await waitFor(() => expect(mutation()).toHaveLength(1));
  expect(screen.getByText("登録しています…")).toBeTruthy(); expect(screen.queryByText("登録状態を確認できません")).toBeNull();
  expect(screen.queryByText("現在、保存された登録が見つかりません。再試行には同じ操作を使います。")).toBeNull();
  expect(screen.getByText("この操作の再確認をやめる")).toHaveProperty("disabled", false);
  expect(mutation()[0].body.idempotencyKey).toBe(op.operationId);
  await act(async () => post(response({ success: true, lead: row })));
  expect(screen.getByText("保存済みです。一覧を更新しています…")).toBeTruthy();
  expect(screen.queryByText("登録状態を確認できません")).toBeNull();
  expect(screen.getByText("この操作の再確認をやめる")).toHaveProperty("disabled", false);
  await act(async () => failList(new Error("list unavailable")));
  await screen.findByText("登録状態を確認できません");
  expect(screen.queryByText("保存済みです。一覧を更新しています…")).toBeNull();
  expect(mocks.operations[0].state).toBe("confirmed"); expect(mutation()).toHaveLength(1);
});
