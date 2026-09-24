// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReviewAnalyticsClient from "./review-analytics-client";
import AnalyticsPage from "./page";
import AliasPage from "../ai/page";
import type { AnalyticsResponse } from "@/lib/review-analytics";
const mocks = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=s1"), session: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: mocks.session } }) }));
const data: AnalyticsResponse = {
  success: true, schoolId: "s1", schoolName: "実校舎", totalReviews: 3, sampledReviews: 3, textReviews: 2, limit: 50,
  analyses: [
    { reviewId: "r1", language: "ja", opinions: [{ category: "指導品質・講師対応", sentiment: "positive", quote: "説明が丁寧" }] },
    { reviewId: "r2", language: "en", opinions: [{ category: "運営・連絡", sentiment: "negative", quote: "Long wait" }, { category: "料金", sentiment: "neutral", quote: "Price" }] },
  ],
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  mocks.params = new URLSearchParams("schoolId=s1");
  mocks.session.mockReset().mockResolvedValue({ data: { session: { access_token: "session" } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe("review analytics UI", () => {
  it("renders actual counts, quoted opinions, and filters without further AI requests", async () => {
    render(<ReviewAnalyticsClient />);
    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.queryByText(/128/)).toBeNull();
    await screen.findByText("実校舎 / Google口コミ 3件");
    expect(screen.getByText("ポジティブ 33.3%")).toBeDefined();
    expect(screen.getByText("ネガティブ 33.3%")).toBeDefined();
    expect(screen.getByText("中立 33.3%")).toBeDefined();
    expect(screen.getByRole("img", { name: "意見分布ドーナツチャート" })).toBeDefined();
    expect(screen.getByText(/本文なし 1件/)).toBeDefined();
    expect(screen.getAllByRole("link", { name: "元の口コミを確認" })[0].getAttribute("href")).toBe("/dashboard/reviews?schoolId=s1&reviewId=r1");
    fireEvent.click(screen.getByRole("button", { name: "日本語 1" }));
    expect(screen.getByText("ポジティブ 100%")).toBeDefined();
    expect(screen.queryByText("Long wait")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "英語 1" }));
    expect(screen.getByText("Long wait")).toBeDefined();
    expect(screen.getByText("ネガティブ 50%")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "その他 0" }));
    expect(screen.getByText("この条件で分析できる意見はありません。")).toBeDefined();
    expect(screen.getByRole("img", { name: "意見分布データなし" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "全体 2" }));
    expect(screen.getByText("説明が丁寧")).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/reviews/analytics?schoolId=s1", expect.objectContaining({ cache: "no-store", headers: { authorization: "Bearer session" } }));
  });
  it("supports both page paths and an empty database without sample metrics", async () => {
    expect(AliasPage).toBe(AnalyticsPage);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...data, totalReviews: 0, sampledReviews: 0, textReviews: 0, analyses: [] })));
    render(<AliasPage />);
    await screen.findByText("Google口コミはまだ登録されていません。");
    expect(screen.getByText("ポジティブ 0%")).toBeDefined();
  });
  it("preserves all-school links and omits an absent query parameter", async () => {
    mocks.params = new URLSearchParams();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ...data, schoolId: null, schoolName: "全校舎" })));
    render(<ReviewAnalyticsClient />);
    await screen.findByText("全校舎 / Google口コミ 3件");
    expect(fetch).toHaveBeenCalledWith("/api/dashboard/reviews/analytics", expect.any(Object));
    expect(screen.getAllByRole("link", { name: "元の口コミを確認" })[0].getAttribute("href")).toContain("schoolId=all");
  });
  it.each(["server", "empty-error", "invalid", "network", "json"])("shows a recoverable error on %s instead of stale/fake data", async mode => {
    const network = vi.fn();
    if (mode === "network") network.mockRejectedValueOnce("offline");
    else network.mockResolvedValueOnce(mode === "json" ? new Response("invalid") : Response.json(mode === "server" ? { error: "分析に失敗しました" } : {}, { status: ["server", "empty-error"].includes(mode) ? 500 : 200 }));
    network.mockResolvedValueOnce(Response.json(data));
    vi.stubGlobal("fetch", network);
    render(<ReviewAnalyticsClient />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("説明が丁寧")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    await screen.findByText("説明が丁寧");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not fetch without a login session", async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    render(<ReviewAnalyticsClient />);
    await screen.findByText("ログイン後に口コミ分析を確認してください。");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["success", "error"])("ignores late %s responses after a school switch", async outcome => {
    const old = deferred<Response>();
    const next = deferred<Response>();
    const network = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    vi.stubGlobal("fetch", network);
    const view = render(<ReviewAnalyticsClient />);
    await waitFor(() => expect(network).toHaveBeenCalledTimes(1));
    mocks.params = new URLSearchParams("schoolId=s2");
    view.rerender(<ReviewAnalyticsClient />);
    await waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    expect((network.mock.calls[0][1].signal as AbortSignal).aborted).toBe(true);
    await act(async () => next.resolve(Response.json({ ...data, schoolId: "s2", schoolName: "別校舎", totalReviews: 0, sampledReviews: 0, textReviews: 0, analyses: [] })));
    await act(async () => outcome === "success" ? old.resolve(Response.json(data)) : old.reject(new Error("old")));
    expect(screen.getByText("別校舎 / Google口コミ 0件")).toBeDefined();
    expect(screen.queryByText("説明が丁寧")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("does not fetch after unmount during session resolution", async () => {
    const session = deferred<{ data: { session: null } }>();
    mocks.session.mockReturnValue(session.promise);
    const view = render(<ReviewAnalyticsClient />);
    view.unmount();
    await act(async () => session.resolve({ data: { session: null } }));
    expect(fetch).not.toHaveBeenCalled();
  });
});
