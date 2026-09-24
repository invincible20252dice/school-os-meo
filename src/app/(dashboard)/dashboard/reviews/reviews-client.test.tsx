// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewsClient from "./reviews-client";
import { renderToString } from "react-dom/server";
import styles from "./page.module.css";

const route = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=school-1") }));
const session = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useSearchParams: () => route.params }));
vi.mock("@/lib/supabase", () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession: session } }),
}));

const review = {
  id: "review-1", schoolId: "school-1", schoolName: "対象校舎", authorName: "投稿者", parentName: "投稿者",
  rating: 5, originalText: "説明が丁寧でした。", status: "PENDING", aiReplyText: "投稿者様\\nありがとうございます。",
  googleReviewManagementUrl: "https://business.google.com/n/100/reviews", repliedAt: "", replyText: "",
};
const list = (rows = [review]) => Response.json({ success: true, reviews: rows });
const success = () => Response.json({ success: true, googlePosted: true, message: "Googleへ送信しました。" });
const button = () => screen.getByRole("button", { name: "Googleに直接返信を送信" });
const editor = () => screen.getByRole("textbox", { name: "AI返信案" }) as HTMLTextAreaElement;
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("ReviewsClient direct Google replies", () => {
  beforeEach(() => {
    route.params = new URLSearchParams("schoolId=school-1");
    session.mockReset().mockResolvedValue({ data: { session: { access_token: "session-token" } } });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it.each(["RATE_LIMITED", "PERMISSION_DENIED"])("preserves the draft and permits retry after a confirmed local save (%s)", async warning => {
    const message = "返信文を下書き保存しました。Googleには未反映です。";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(list())
      .mockResolvedValueOnce(Response.json({ success: true, googlePosted: false, draftSaved: true, deliveryStatus: "DRAFT_SAVED", warning, message }))
      .mockResolvedValueOnce(list([{ ...review, aiReplyText: "修正した下書き" }]))
      .mockResolvedValueOnce(success())
      .mockResolvedValueOnce(list([{ ...review, aiReplyText: "修正した下書き", replyText: "修正した下書き", repliedAt: "2026-09-24T00:00:00Z" }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: "修正した下書き" } });
    fireEvent.click(button());
    await screen.findByText(message);
    expect(screen.getByRole("status").className).toBe(styles.warningMessage);
    expect(editor().value).toBe("修正した下書き");
    expect(editor().disabled).toBe(false);
    expect((button() as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText("未返信")).toBeDefined();
    expect(screen.queryByText("返信済")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    await waitFor(() => expect(editor().disabled).toBe(false));
    expect(editor().value).toBe("修正した下書き");
    fireEvent.click(button());
    await screen.findByText("Googleへ送信しました。");
    expect(screen.getByText("返信済")).toBeDefined();
    expect(screen.getByRole("status").className).toBe(styles.successMessage);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("keeps edited text when both Google and the draft save fail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json({ success: false, googlePosted: false, code: "DRAFT_SAVE_FAILED", message: "下書き保存にも失敗しました。" }, { status: 500 })));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: "失ってはいけない本文" } });
    fireEvent.click(button());
    await screen.findByText("下書き保存にも失敗しました。");
    expect(editor().value).toBe("失ってはいけない本文");
    expect(screen.getByRole("status").className).toBe(styles.errorMessage);
    expect(screen.queryByText("返信済")).toBeNull();
  });

  it("posts the edited text without opening Google and refreshes only after confirmed success", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(list()).mockResolvedValueOnce(success())
      .mockResolvedValueOnce(list([{ ...review, repliedAt: "2026-09-24T00:00:00Z", aiReplyText: "編集した返信\n本文" }]));
    vi.stubGlobal("fetch", fetchMock);
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    expect(editor().value).toBe("投稿者様\nありがとうございます。");
    fireEvent.change(editor(), { target: { value: "編集した返信\\n本文" } });
    fireEvent.click(button());
    await screen.findByText("Googleへ送信しました。");
    expect(screen.getByText("返信済")).toBeDefined();
    expect(editor().value).toBe("編集した返信\n本文");
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toEqual({ reviewId: "review-1", schoolId: "school-1", replyText: "編集した返信\n本文" });
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({ authorization: "Bearer session-token" });
    expect(open).not.toHaveBeenCalled();
  });

  it("locks edits and prevents duplicate submissions while a request is pending", async () => {
    const pending = deferred();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(list()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(list());
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(button());
    const sending = screen.getByRole("button", { name: "Googleに送信中…" }) as HTMLButtonElement;
    expect(sending.disabled).toBe(true);
    expect(editor().disabled).toBe(true);
    fireEvent.click(sending);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await act(async () => pending.resolve(success()));
    await screen.findByText("Googleへ送信しました。");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each([
    [502, { success: false, googlePosted: false, message: "Googleがアクセスを拒否しました。" }],
    [200, { success: true, googlePosted: false }],
    [500, { success: false, googlePosted: true, message: "Googleへ送信済みですがDB保存に失敗しました。" }],
  ])("preserves the edited text and pending badge on unconfirmed completion (case %#)", async (status, result) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json(result, { status }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: "失わない返信本文" } });
    fireEvent.click(button());
    await screen.findByRole("status");
    expect(editor().value).toBe("失わない返信本文");
    expect(screen.getByText("未返信")).toBeDefined();
    expect(screen.queryByText("返信済")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not submit whitespace-only replies", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(list());
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: " \\n " } });
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("displays authentication failure instead of a misleading empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ message: "ログイン後に口コミ一覧を確認してください。" }, { status: 401 })));
    render(<ReviewsClient />);
    await screen.findByText("ログイン後に口コミ一覧を確認してください。");
    expect(screen.queryByText(/この校舎の口コミはまだありません/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("does not let an older school response replace the newly selected school's records", async () => {
    const first = deferred();
    const second = { ...review, id: "review-2", schoolId: "school-2", schoolName: "切替後の校舎", authorName: "別投稿者" };
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce(list([second])));
    const view = render(<ReviewsClient />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<ReviewsClient />);
    await screen.findByText("切替後の校舎");
    await act(async () => first.resolve(list()));
    expect(screen.queryByText("対象校舎")).toBeNull();
    expect(screen.getByText("切替後の校舎")).toBeDefined();
  });

  it("ignores a posting response after the user switches schools", async () => {
    const pending = deferred();
    const second = { ...review, id: "review-2", schoolId: "school-2", schoolName: "切替後の校舎", authorName: "別投稿者" };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(list()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(list([second]));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(button());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<ReviewsClient />);
    await screen.findByText("切替後の校舎");
    await act(async () => pending.resolve(success()));
    expect(screen.queryByText("Googleへ送信しました。")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("keeps a failed refresh visible instead of replacing it with a success message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(success())
      .mockResolvedValueOnce(Response.json({ message: "口コミ一覧を取得できませんでした。" }, { status: 500 })));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(button());
    await screen.findByText("口コミ一覧を取得できませんでした。");
    expect(screen.queryByText("Googleへ送信しました。")).toBeNull();
  });

  it.each(["no-session", "session-error"])("does not invent authentication for %s", async (scenario) => {
    if (scenario === "no-session") session.mockResolvedValue({ data: { session: null } });
    else session.mockRejectedValue(new Error("session unavailable"));
    route.params = new URLSearchParams();
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: "要ログイン" }, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("要ログイン");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/reviews", { cache: "no-store", headers: {} });
  });

  it.each([null, {}, { success: true }, { success: false, reviews: [] }, { success: true, reviews: {} }])("does not disguise an invalid list response as an empty school (case %#)", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    render(<ReviewsClient />);
    await screen.findByText("口コミ一覧を取得できませんでした。");
    expect(screen.queryByText(/この校舎の口コミはまだありません/)).toBeNull();
  });

  it("shows a true empty list and supports retry after a network rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce("network failure").mockResolvedValueOnce(list([]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("口コミ一覧を取得できませんでした。");
    fireEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    await screen.findByText(/この校舎の口コミはまだありません/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a late list rejection after a school change", async () => {
    const old = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(list([])));
    const view = render(<ReviewsClient />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<ReviewsClient />);
    await screen.findByText(/この校舎の口コミはまだありません/);
    await act(async () => old.reject(new Error("old failure")));
    expect(screen.queryByText("old failure")).toBeNull();
  });

  it.each(["review-1", "missing"])("handles an edit deep link for %s", async (id) => {
    route.params = new URLSearchParams(`reviewId=${id}&action=edit`);
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(list()));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    if (id === "review-1") {
      expect(document.activeElement).toBe(editor());
      expect(scroll).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
    } else expect(scroll).not.toHaveBeenCalled();
  });

  it("renders nullable ratings, legacy author names, and school-specific configuration links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(list([{ ...review, authorName: "", rating: null, googleReviewManagementUrl: null } as unknown as typeof review])));
    render(<ReviewsClient />);
    await screen.findByText("評価なし");
    expect(screen.getByText("投稿者")).toBeDefined();
    expect(screen.getByRole("link", { name: "GBP店舗を設定" }).getAttribute("href")).toBe("/dashboard/settings/google?schoolId=school-1");
    expect(screen.queryByRole("link", { name: "AI返信案をコピーしてGoogleで返信" })).toBeNull();
  });

  it.each(["sync", "manual"])("refreshes after successful %s with the correct school", async (action) => {
    route.params = new URLSearchParams();
    const fetchMock = vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json({ success: true, count: 2 }))
      .mockResolvedValueOnce(list([{ ...review, repliedAt: action === "manual" ? "2026-09-24T00:00:00Z" : "" }]));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(screen.getByRole("button", { name: action === "sync" ? "GBP口コミを同期" : "返信済みにする" }));
    await screen.findByText(action === "sync" ? "Google口コミを2件同期しました。" : "Googleでの返信完了を記録しました。");
    const request = fetchMock.mock.calls[1][1];
    expect(request.method).toBe(action === "sync" ? "POST" : "PATCH");
    expect(JSON.parse(request.body)).toEqual(action === "sync" ? {} : { schoolId: "school-1", reviewId: "review-1", replyText: "投稿者様\nありがとうございます。" });
    if (action === "manual") expect(screen.getByText("返信済")).toBeDefined();
  });

  it.each(["sync", "manual"])("does not overwrite a list refresh failure after %s", async (action) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(Response.json({ success: true }))
      .mockResolvedValueOnce(Response.json({ message: "再取得失敗" }, { status: 500 })));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(screen.getByRole("button", { name: action === "sync" ? "GBP口コミを同期" : "返信済みにする" }));
    await screen.findByText("再取得失敗");
    expect(screen.getByRole("status").textContent).toBe("再取得失敗");
  });

  it.each(["sync", "manual", "direct"])("serializes %s with all other mutations", async (action) => {
    const pending = deferred();
    const fetchMock = vi.fn().mockResolvedValueOnce(list()).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(list());
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(screen.getByRole("button", { name: action === "sync" ? "GBP口コミを同期" : action === "manual" ? "返信済みにする" : "Googleに直接返信を送信" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    for (const name of ["GBP口コミを同期", "返信済みにする", "再読み込み", action === "direct" ? "Googleに送信中…" : "Googleに直接返信を送信"]) {
      const control = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(control.disabled).toBe(true);
      fireEvent.click(control);
    }
    expect(editor().disabled).toBe(true);
    expect(fireEvent.click(screen.getByRole("link", { name: "AI返信案をコピーしてGoogleで返信" }))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(success()));
    await waitFor(() => expect((screen.getByRole("button", { name: "再読み込み" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it.each(["sync", "manual", "direct"].flatMap(action => [true, false].map(reject => ({ action, reject }))))("ignores stale $action completion (reject=$reject)", async ({ action, reject }) => {
    const old = deferred();
    const fetchMock = vi.fn().mockResolvedValueOnce(list()).mockReturnValueOnce(old.promise).mockResolvedValueOnce(list([]));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(screen.getByRole("button", { name: action === "sync" ? "GBP口コミを同期" : action === "manual" ? "返信済みにする" : "Googleに直接返信を送信" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<ReviewsClient />);
    await screen.findByText(/この校舎の口コミはまだありません/);
    await act(async () => reject ? old.reject(new Error("old mutation failure")) : old.resolve(success()));
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it.each(["sync", "manual"].flatMap(action => ["http", "logical", "network", "message"].map(kind => ({ action, kind }))))("keeps drafts when $action fails with $kind", async ({ action, kind }) => {
    const fetchMock = vi.fn().mockResolvedValueOnce(list());
    if (kind === "network") fetchMock.mockRejectedValueOnce("network failure");
    else fetchMock.mockResolvedValueOnce(Response.json(kind === "message" ? { error: "同期拒否", message: "更新拒否" } : { success: false }, { status: kind === "http" ? 500 : 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: "保持する編集内容" } });
    fireEvent.click(screen.getByRole("button", { name: action === "sync" ? "GBP口コミを同期" : "返信済みにする" }));
    await screen.findByRole("status");
    expect(screen.getByRole("status").textContent).toBe(kind === "message" ? action === "sync" ? "同期拒否" : "更新拒否" : action === "sync" ? "Google口コミを同期できませんでした。" : "返信状態を更新できませんでした。");
    expect(editor().value).toBe("保持する編集内容");
    expect(screen.queryByText("返信済")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("copies the edited text while preserving the native secure Google link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(list()));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: "編集した本文\\n結び" } });
    const link = screen.getByRole("link", { name: "AI返信案をコピーしてGoogleで返信" });
    expect(link.getAttribute("href")).toBe("https://business.google.com/n/100/reviews");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(link);
    await screen.findByText(/返信文をコピーしました/);
    expect(writeText).toHaveBeenCalledWith("編集した本文\n結び");
  });

  it.each([true, false])("cleans up the existing legacy clipboard path (success=%s)", async (ok) => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("clipboard denied")) } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => ok) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(list()));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(screen.getByRole("link", { name: "AI返信案をコピーしてGoogleで返信" }));
    await screen.findByRole("status");
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelectorAll("textarea")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toContain(ok ? "コピーしました" : "コピーできませんでした");
  });

  it("blocks navigation and copying for an empty draft", async () => {
    const writeText = vi.fn();
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(list()));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.change(editor(), { target: { value: "" } });
    expect(fireEvent.click(screen.getByRole("link", { name: "AI返信案をコピーしてGoogleで返信" }))).toBe(false);
    await screen.findByText("コピーするAI返信案を入力してください。");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("server-renders a loading state without accessing browser APIs or claiming an empty list", () => {
    vi.stubGlobal("window", undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const html = renderToString(<ReviewsClient />);
    expect(html).toContain("口コミを読み込んでいます。");
    expect(html).not.toContain("この校舎の口コミはまだありません");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([true, false])("ignores clipboard completion after navigation (reject=%s)", async (reject) => {
    const pending = deferred();
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => { await pending.promise; } } });
    Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => false) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(list()).mockResolvedValueOnce(list([])));
    const view = render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(screen.getByRole("link", { name: "AI返信案をコピーしてGoogleで返信" }));
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<ReviewsClient />);
    await screen.findByText(/この校舎の口コミはまだありません/);
    await act(async () => reject ? pending.reject(new Error("clipboard error")) : pending.resolve(new Response()));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("preserves the draft when a direct submission rejects without an Error object", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(list()).mockRejectedValueOnce("network failure"));
    render(<ReviewsClient />);
    await screen.findByText("投稿者");
    fireEvent.click(button());
    await screen.findByText("Googleへ返信を送信できませんでした。");
    expect(editor().value).toBe("投稿者様\nありがとうございます。");
  });
});
