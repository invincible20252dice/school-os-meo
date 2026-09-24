// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewsClient from "./reviews-client";

const route = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=school-1") }));
vi.mock("next/navigation", () => ({ useSearchParams: () => route.params }));
vi.mock("@/lib/supabase", () => ({
  createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "session-token" } } }) } }),
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
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("ReviewsClient direct Google replies", () => {
  beforeEach(() => { route.params = new URLSearchParams("schoolId=school-1"); });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

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
});
