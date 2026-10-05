// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImgHTMLAttributes } from "react";
import { ActionExecutionGuide } from "./action-guide";
import { guideForAction, guideRegistry, photoGuides } from "@/lib/action-guides";
import { snapshot } from "@/test/challenge-fixtures";
const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: session } }) }));
vi.mock("next/image", () => ({ default: (props: ImgHTMLAttributes<HTMLImageElement>) => <img {...props} alt={props.alt} /> }));
const fetcher = vi.fn(); const copy = vi.fn();
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal("fetch", fetcher);
  session.mockResolvedValue({ data: { session: { access_token: "token" } } });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy.mockResolvedValue(undefined) } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function openGuide(container: HTMLElement) {
  const details = container.querySelector("details")!;
  toggle(details, true);
  await waitFor(() => expect(details.querySelector("h4")).not.toBeNull());
  return details;
}
function toggle(details: HTMLDetailsElement, open: boolean) { act(() => { details.open = open; fireEvent(details, new Event("toggle")); }); }
async function renderDraft(guideId = "description", data?: ReturnType<typeof snapshot>) {
  const result = render(<ActionExecutionGuide guide={guideRegistry.get(guideId)} schoolId="a" snapshot={data} />);
  await openGuide(result.container);
  fireEvent.change(screen.getByLabelText("確認済みの教室情報"), { target: { value: "高校生対象の予約制面談" } });
  return result;
}
describe("progressive execution guides", () => {
  it("does not render an unregistered guide", () => {
    const { container } = render(<ActionExecutionGuide schoolId="a" />); expect(container.innerHTML).toBe("");
  });
  it("loads GOOD/NG only on open, executes only explicitly, handles missing image", async () => {
    const execute = vi.fn(); const { container } = render(<ActionExecutionGuide guide={photoGuides[0]} schoolId="a b" onExecute={execute} />);
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    const details = await openGuide(container);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText("おすすめ例")).toBeTruthy(); expect(screen.getByText("避けたい例")).toBeTruthy();
    expect(screen.getByText(/Googleへ投稿せず/)).toBeTruthy(); expect(execute).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/dashboard/settings/google?schoolId=a%20b");
    fireEvent.error(screen.getAllByRole("img")[0]); expect(screen.getAllByRole("img")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "確認・実行記録へ進む" })); expect(execute).toHaveBeenCalledTimes(1);
    toggle(details, false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows text-only guides without image artifacts", async () => {
    const { container } = render(<ActionExecutionGuide guide={guideForAction("check-7-links")} schoolId="a" />);
    await openGuide(container); expect(screen.getAllByRole("list")).toHaveLength(2); expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(screen.getByText(/テスト送信/)).toBeTruthy();
  });
  it("copies neutral request text without sending or saving progress", async () => {
    const { container } = render(<ActionExecutionGuide guide={guideForAction("request-reviews")} schoolId="a" />); await openGuide(container);
    fireEvent.click(screen.getByRole("button", { name: "依頼例文をコピー" }));
    await screen.findByText(/コピーしました。送信/); expect(copy).toHaveBeenCalledWith(expect.stringContaining("率直なお声")); expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/dashboard/surveys?schoolId=a");
    copy.mockRejectedValueOnce(new Error("denied")); fireEvent.click(screen.getByRole("button", { name: "依頼例文をコピー" })); await screen.findByText(/コピーできませんでした/);
  });
  it("requires explicit facts, shows Before/After, and permits editing/copy without publishing", async () => {
    const { container } = render(<ActionExecutionGuide guide={guideRegistry.get("description")} schoolId="a" />); await openGuide(container);
    expect(screen.getByText("改善前の例")).toBeTruthy(); expect((screen.getByRole("button", { name: "AIで自校舎用に作る" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("確認済みの教室情報"), { target: { value: "確認済みの事実" } });
    fireEvent.change(screen.getByLabelText("文章のテーマ"), { target: { value: "" } }); expect((screen.getByRole("button", { name: "AIで自校舎用に作る" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("文章のテーマ"), { target: { value: "面談" } });
    fetcher.mockResolvedValue(Response.json({ success: true, draft: "下書き" }));
    fireEvent.click(screen.getByRole("button", { name: "AIで自校舎用に作る" })); await screen.findByText(/まだ公開されていません/);
    expect(fetcher).toHaveBeenCalledWith("/api/dashboard/challenge/guide-draft?schoolId=a", expect.objectContaining({ method: "POST", body: JSON.stringify({ purpose: "description", facts: "確認済みの事実", theme: "面談" }) }));
    fireEvent.change(screen.getByLabelText("AI下書き（編集・事実確認後に使用）"), { target: { value: "修正済み" } });
    fireEvent.click(screen.getByRole("button", { name: "確認した下書きをコピー" })); await waitFor(() => expect(copy).toHaveBeenCalledWith("修正済み")); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses measured query themes and reuses existing photo assets", async () => {
    const data = { ...snapshot(), demand: [{ query: "面談", month: "2026-09", impressions: 25, updatedAt: "2026-10-01" }] };
    const { container } = await renderDraft("publish-post", data);
    fireEvent.click(screen.getByRole("button", { name: /面談.*このテーマを使う/ })); expect((screen.getByLabelText("文章のテーマ") as HTMLInputElement).value).toContain("面談について");
    expect(screen.getByText(/市場全体の検索数ではありません/)).toBeTruthy();
    const nested = container.querySelectorAll("details");
    const photo = Array.from(nested).find(el => el.querySelector("summary")?.textContent?.includes("自習の写真を撮る"))!;
    toggle(photo, true); await screen.findByAltText("自習写真の撮影お手本（AI生成）");
  });
  it.each([null, [], undefined])("explains absent/failed demand %s without inventing numbers", async demand => {
    await renderDraft("publish-post", { ...snapshot(), demand }); expect(screen.getByText(/確認済みの教室情報からテーマを入力できます/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /このテーマを使う/ })).toBeNull();
  });
  it.each([
    { value: { success: false, error: "権限なし" }, status: 403, message: "権限なし" },
    { value: { success: false }, status: 500, message: "文章生成に失敗しました。" },
    { value: { success: true, draft: 5 }, status: 200, message: "文章生成に失敗しました。" },
    { value: { success: false }, status: 200, message: "文章生成に失敗しました。" },
  ])("handles unsuccessful AI response $status", async ({ value, status, message }) => {
    await renderDraft(); fetcher.mockResolvedValue(Response.json(value, { status })); fireEvent.click(screen.getByRole("button", { name: "AIで自校舎用に作る" }));
    await screen.findByText(message); expect(screen.queryByLabelText("AI下書き（編集・事実確認後に使用）")).toBeNull();
  });
  it.each([new Error("通信失敗"), "unknown"])("handles network failure %s", async error => {
    await renderDraft(); fetcher.mockRejectedValue(error); fireEvent.click(screen.getByRole("button", { name: "AIで自校舎用に作る" })); await screen.findByText(error instanceof Error ? error.message : "文章生成に失敗しました。");
  });
  it("rejects unauthenticated generation", async () => {
    await renderDraft(); session.mockResolvedValue({ data: { session: null } }); fireEvent.click(screen.getByRole("button", { name: "AIで自校舎用に作る" })); await screen.findByText("ログインしてください。"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts old-school work and clears draft on school switch", async () => {
    let resolve!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>(r => { resolve = r; }));
    const view = await renderDraft(); fireEvent.click(screen.getByRole("button", { name: "AIで自校舎用に作る" })); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    const signal = fetcher.mock.calls[0][1].signal;
    view.rerender(<ActionExecutionGuide guide={guideRegistry.get("description")} schoolId="b" />);
    expect(signal.aborted).toBe(true); expect((screen.getByLabelText("確認済みの教室情報") as HTMLTextAreaElement).value).toBe("");
    await act(async () => resolve(Response.json({ success: true, draft: "校舎Aの秘密" })));
    expect(screen.queryByText("校舎Aの秘密")).toBeNull();
  });
  it("does not display unmount abort errors or duplicate generation", async () => {
    let reject!: (error: Error) => void;
    fetcher.mockImplementation(() => new Promise((_resolve, r) => { reject = r; }));
    const view = await renderDraft(); const button = screen.getByRole("button", { name: "AIで自校舎用に作る" });
    act(() => { fireEvent.click(button); fireEvent.click(button); }); await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    view.unmount(); await act(async () => reject(new Error("Abort"))); expect(screen.queryByRole("status")).toBeNull();
  });
});
