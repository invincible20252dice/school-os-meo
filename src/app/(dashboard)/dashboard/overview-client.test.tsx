// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDashboardOverview, type DashboardOverview, type OverviewRecords } from "@/lib/dashboard-summary";
import OverviewClient from "./overview-client";

const route = vi.hoisted(() => ({ params: new URLSearchParams("schoolId=school-1") }));
const session = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useSearchParams: () => route.params }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: session } }) }));
const now = new Date("2026-09-24T01:00:00Z");
function payload(records: Partial<OverviewRecords> = {}, scope: Partial<DashboardOverview> = {}) {
  return { success: true, schoolId: "school-1", schoolName: "対象校舎", schoolCount: 1, generatedAt: now.toISOString(),
    summary: buildDashboardOverview({ reviews: [], keywords: [], queries: [], alerts: [], ...records }, now), ...scope };
}
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  route.params = new URLSearchParams("schoolId=school-1");
  session.mockReset().mockResolvedValue({ data: { session: { access_token: "session-token" } } });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("OverviewClient", () => {
  it("renders computed metrics and school-scoped actions from the authenticated API", async () => {
    const body = payload({
      reviews: [{ rating: 4, status: "PENDING", repliedAt: null, postedAt: now, createdAt: now }],
      keywords: [{ id: "k1", schoolId: "school-1", keyword: "熊本 大学受験", rankHistories: [{ rank: 2, checkedAt: now }, { rank: 4, checkedAt: now }], aioScoreHistories: [{ totalScore: 73, chatgptScore: 81, geminiScore: 72, googleAiScore: 66, checkedAt: now }] }],
      queries: [{ query: "大学受験 個別指導", targetMonth: "2026-08", impressionCount: 42 }],
      alerts: [{ status: "OPEN", riskLevel: "HIGH" }, { status: "IN_PROGRESS", riskLevel: "MEDIUM" }],
    });
    const fetchMock = vi.fn().mockResolvedValue(Response.json(body));
    vi.stubGlobal("fetch", fetchMock);
    render(<OverviewClient />);
    await screen.findByText("対象校舎");
    expect(screen.getByText("平均評価 4.0")).toBeDefined();
    expect(screen.getByText("2026-09：1件 / 前月：0件（+1件）")).toBeDefined();
    expect(screen.getByText("2位")).toBeDefined();
    expect(screen.getByText("前回比 +2位")).toBeDefined();
    expect(screen.getByText("73%")).toBeDefined();
    expect(screen.getByText("ChatGPT 81% / Gemini 72%")).toBeDefined();
    expect(screen.getByText("Google AI 66% / 1キーワード")).toBeDefined();
    expect(screen.getByText("大学受験 個別指導")).toBeDefined();
    expect(screen.getByText("2026-08 / 表示 42回")).toBeDefined();
    expect(screen.getByText("未対応 1件 / 対応中 1件")).toBeDefined();
    expect(screen.getByText("未解決の高リスク 1件")).toBeDefined();
    expect(screen.getByText("未返信の口コミが1件あります。")).toBeDefined();
    for (const link of screen.getAllByRole("link")) expect(link.getAttribute("href")).toContain("schoolId=school-1");
    expect(screen.getByRole("link", { name: "未返信口コミ1件の返信案を確認してください。" }).getAttribute("href")).toBe("/dashboard/reviews?schoolId=school-1");
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/overview?schoolId=school-1", expect.objectContaining({ headers: { authorization: "Bearer session-token" }, cache: "no-store" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("distinguishes an empty database from measured zeroes and does not invent school metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload())));
    render(<OverviewClient />);
    await screen.findByText("対象校舎");
    expect(screen.getByText("0件")).toBeDefined();
    expect(screen.getByText("平均評価 未評価")).toBeDefined();
    expect(screen.getAllByText("未計測")).toHaveLength(2);
    expect(screen.getByText("比較データなし")).toBeDefined();
    expect(screen.getByText("流入語句データなし")).toBeDefined();
    expect(screen.getByText("未返信の口コミはありません。")).toBeDefined();
    expect(screen.getByText("現在、優先対応が必要なタスクはありません。")).toBeDefined();
    expect(document.body.textContent).not.toMatch(/青葉|横浜|28件|5\.0|68%/);
  });

  it.each([null, 0, -2])("shows actual rank state and difference (%s), including a measured zero AIO", async difference => {
    const body = payload();
    body.summary.meo = { schoolId: "school-1", keyword: "登録キーワード", rank: difference === null ? null : 5, previousRank: null, difference, measuredAt: now.toISOString() };
    body.summary.aio = { score: 0, chatGpt: 0, gemini: 0, googleAi: 0, keywordCount: 1 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    render(<OverviewClient />);
    await screen.findByText("対象校舎");
    expect(screen.getByText(difference === null ? "圏外" : "5位")).toBeDefined();
    expect(screen.getByText(difference === null ? "比較データなし" : `前回比 ${difference}位`)).toBeDefined();
    expect(screen.getByText("0%")).toBeDefined();
    expect(screen.queryByText("未計測")).toBeNull();
  });

  it.each(["", "schoolId=all"])("preserves all-school scope in links (%s)", async query => {
    route.params = new URLSearchParams(query);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload({}, { schoolId: null, schoolName: "全校舎", schoolCount: 3 }))));
    render(<OverviewClient />);
    await screen.findByText("全校舎（3校舎）");
    expect(fetch).toHaveBeenCalledWith(`/api/dashboard/overview${query ? `?${query}` : ""}`, expect.anything());
    expect(screen.getByRole("link", { name: "口コミを確認" }).getAttribute("href")).toBe("/dashboard/reviews?schoolId=all");
  });

  it("shows only loading until the API completes, then renders the received metrics", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    render(<OverviewClient />);
    expect(screen.getByRole("status").textContent).toBe("ダッシュボードを読み込んでいます。");
    expect(screen.queryByText("0件")).toBeNull();
    await act(async () => pending.resolve(Response.json(payload())));
    await screen.findByText("対象校舎");
  });

  it("requires a session without making an unauthenticated data request", async () => {
    session.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal("fetch", vi.fn());
    render(<OverviewClient />);
    expect((await screen.findByRole("alert")).textContent).toBe("ログイン後にダッシュボードを確認してください。");
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([
    { status: 500, body: { error: "集計に失敗しました。" }, error: "集計に失敗しました。" },
    { status: 401, body: {}, error: "ダッシュボードの集計データを取得できませんでした。" },
    { status: 200, body: null, error: "ダッシュボードの集計データを取得できませんでした。" },
    { status: 200, body: { success: false }, error: "ダッシュボードの集計データを取得できませんでした。" },
    { status: 200, body: { success: true }, error: "ダッシュボードの集計データを取得できませんでした。" },
  ])("does not represent invalid/failed responses as zero metrics (case %#)", async ({ status, body, error }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
    render(<OverviewClient />);
    expect((await screen.findByRole("alert")).textContent).toBe(error);
    expect(screen.queryByText("0件")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it.each([new Error("通信エラー"), "network failure"])("handles rejected requests and allows a real retry (%s)", async error => {
    const fetchMock = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(Response.json(payload()));
    vi.stubGlobal("fetch", fetchMock);
    render(<OverviewClient />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    await screen.findByText("対象校舎");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("ignores a stale school's response after switching (reject=%s)", async reject => {
    const old = deferred();
    const fetchMock = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce(Response.json(payload({}, { schoolId: "school-2", schoolName: "切替後の校舎" })));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<OverviewClient />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<OverviewClient />);
    expect(signal.aborted).toBe(true);
    await screen.findByText("切替後の校舎");
    await act(async () => reject ? old.reject(new Error("stale")) : old.resolve(Response.json(payload())));
    expect(screen.queryByText("対象校舎")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("link", { name: "口コミを確認" }).getAttribute("href")).toBe("/dashboard/reviews?schoolId=school-2");
  });

  it("clears already-loaded data immediately when the school changes", async () => {
    const pending = deferred();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(payload())).mockReturnValueOnce(pending.promise));
    const view = render(<OverviewClient />);
    await screen.findByText("対象校舎");
    route.params = new URLSearchParams("schoolId=school-2");
    view.rerender(<OverviewClient />);
    expect(screen.queryByText("対象校舎")).toBeNull();
    expect(screen.queryByText("0件")).toBeNull();
    expect(screen.getByRole("status")).toBeDefined();
    await act(async () => pending.resolve(Response.json(payload({}, { schoolName: "新しい校舎" }))));
    await screen.findByText("新しい校舎");
  });

  it("server-renders only loading without accessing the database or browser", () => {
    vi.stubGlobal("fetch", vi.fn());
    const html = renderToString(<OverviewClient />);
    expect(html).toContain("ダッシュボードを読み込んでいます。");
    expect(html).not.toContain("0件");
    expect(fetch).not.toHaveBeenCalled();
  });
});
