// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RankingClient from "./ranking-client";
import { buildDashboardRankingData } from "@/lib/dashboard-rankings";

const state = vi.hoisted(() => ({ schoolId: "s1", session: true }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ schoolId: state.schoolId }) }));
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: state.session ? { access_token: "test-token" } : null } }) } }) }));
function data(rank: number | null = 3, measured = true) {
  return { success: true, ...buildDashboardRankingData({ school: { id: state.schoolId, name: "対象校舎", city: "市" }, keywords: [{
    id: "k1", schoolId: state.schoolId, keyword: "大学受験", location: "地点", municipality: "市", nearestStation: "駅", latitude: 0, longitude: 130, radiusMeters: 1500, isActive: true, createdAt: "2026-10-01",
    rankHistories: measured ? [{ id: "r1", rank, checkedAt: "2026-10-02", competitorData: [{ name: "対象校舎", rank: 3, rating: 5, reviewCount: 3 }, { name: "競合", rank: 1 }] }, { id: "r2", rank: 5, checkedAt: "2026-10-01" }] : [],
  }, { id: "k2", schoolId: state.schoolId, keyword: "個別指導", location: "地点2", municipality: "市", nearestStation: "駅2", radiusMeters: 1000, isActive: true, createdAt: "2026-10-01" }] }) };
}
beforeEach(() => { state.schoolId = "s1"; state.session = true; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("DB-backed ranking screen", () => {
  it("labels simulation throughout refresh without claiming a real measurement", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ ...data(), dataSource: "SIMULATION" })));
    render(<RankingClient />);
    await screen.findByText("シミュレーション・実測値ではありません");
    expect(screen.getByText("サンプル日時")).toBeDefined();
    expect(screen.getByRole("heading", { name: "競合サンプル 2店舗" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    await screen.findByText(/シミュレーションデータを再取得しました/);
    expect(screen.queryByText(/保存済みの順位データを再取得しました/)).toBeNull();
  });
  it("renders measured data, sends auth, switches keywords and reloads", async () => {
    const initial = data();
    const second = { ...data(6), selectedKeyword: initial.keywords[1], currentKeyword: "個別指導" };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(initial)).mockResolvedValueOnce(Response.json(second)).mockResolvedValueOnce(Response.json(second));
    vi.stubGlobal("fetch", fetcher);
    render(<RankingClient />);
    expect(screen.getByRole("status").textContent).toContain("読み込んでいます");
    await screen.findByText("+2");
    expect(screen.getAllByText("対象校舎").length).toBeGreaterThan(0);
    expect(screen.getByText("0, 130")).toBeDefined();
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining("schoolId=s1"), expect.objectContaining({ headers: { authorization: "Bearer test-token" }, cache: "no-store" }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "k2" } });
    await screen.findByText("1000m");
    expect(screen.getByText("-1")).toBeDefined();
    expect(fetcher.mock.calls[1][0]).toContain("keywordId=k2");
    fireEvent.click(screen.getByRole("button", { name: "再取得" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    await screen.findByText(/保存済みの順位データを再取得しました/);
    expect(screen.getByText("2026/10/2 9:00:00")).toBeDefined();
  });

  it.each(["", "all"])("does not query cross-school data for %s", schoolId => {
    state.schoolId = schoolId;
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<RankingClient />);
    expect(screen.getByRole("status").textContent).toContain("校舎を選択");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    state.session = false; const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    render(<RankingClient />);
    expect((await screen.findByRole("alert")).textContent).toContain("ログイン後");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([false, true])("distinguishes unmeasured and measured out-of-range (measured=%s)", async measured => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data(null, measured))));
    render(<RankingClient />);
    await screen.findByRole("combobox");
    expect(screen.getAllByText(measured ? "圏外" : "未計測").length).toBeGreaterThan(0);
    expect(screen.queryByText(measured ? "未計測" : "圏外")).toBeNull();
  });

  it("renders genuine empty data without invented keywords or competitors", async () => {
    const body = { success: true, ...buildDashboardRankingData({ school: { id: "s1", name: "対象校舎" }, keywords: [] }) };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body)));
    render(<RankingClient />);
    await screen.findByText("キーワード未登録");
    expect((screen.getByRole("combobox") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByText("順位履歴はまだありません。")).toBeDefined();
    expect(screen.getByText("競合データはまだありません。")).toBeDefined();
  });

  it.each([
    [403, { success: false, error: "閲覧権限がありません" }, "閲覧権限がありません"],
    [500, {}, "順位データを取得できませんでした。"],
    [200, { success: false }, "順位データを取得できませんでした。"],
    [200, { success: true, school: null }, "順位データを取得できませんでした。"],
    [200, { ...data(), keywords: null }, "順位データを取得できませんでした。"],
    [200, { ...data(), history: null }, "順位データを取得できませんでした。"],
    [200, { ...data(), competitors: null }, "順位データを取得できませんでした。"],
  ])("reports HTTP/schema failure without empty-data substitution (%s)", async (status, body, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(body, { status })));
    render(<RankingClient />);
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it.each([new Error("network failed"), "offline"])("reports transport failures", async error => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error)); render(<RankingClient />);
    expect((await screen.findByRole("alert")).textContent).toBe(error instanceof Error ? error.message : "順位データを取得できませんでした。");
  });

  it.each([false, true])("ignores stale school requests even when aborted fetch settles (reject=%s)", async reject => {
    let settle!: (value: Response) => void;
    let fail!: (reason: Error) => void;
    const old = new Promise<Response>((resolve, rejectPromise) => { settle = resolve; fail = rejectPromise; });
    const newer = { ...data(), school: { ...data().school!, id: "s2", name: "新校舎" } };
    const fetcher = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(Response.json(newer));
    vi.stubGlobal("fetch", fetcher);
    const view = render(<RankingClient />);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    state.schoolId = "s2"; view.rerender(<RankingClient />);
    await screen.findByText("新校舎");
    await act(async () => { if (reject) fail(new Error("stale failure")); else settle(Response.json(data())); });
    expect(screen.getByText("新校舎")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
