// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MonthlyReportPage from "./page";

const mocks = vi.hoisted(() => ({ params: new URLSearchParams(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useSearchParams: () => mocks.params }));
const report = (schoolName = "検証用A校", score = 42) => ({
  schoolName, period: "2026年8月度", score, rank: "C", monthOverMonth: "比較未取得",
  aiComment: "取得したレポートのコメント",
  metrics: [{ label: "口コミ", value: "0件", detail: "取得値", trend: "", tone: "watch" }],
  actions: [{ title: "取得した提案", detail: "提案の詳細", owner: "担当" }],
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function expectNeutral() {
  expect(screen.queryByRole("img", { name: /総合評価/ })).toBeNull();
  expect(screen.queryByText(/判定$/)).toBeNull();
  expect(screen.queryByText("改善提案・アクションプラン")).toBeNull();
  expect(screen.queryByText(/青葉ゼミナール/)).toBeNull();
  expect(screen.queryByText("88/100点")).toBeNull();
  expect(screen.getByText("比較データは未取得です。")).toBeTruthy();
  expect(screen.queryByLabelText("インサイト比較期間")).toBeNull();
}
beforeEach(() => {
  mocks.params = new URLSearchParams("schoolId=school-a&month=2026-08");
  mocks.fetch.mockReset();
  vi.stubGlobal("fetch", mocks.fetch);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows a neutral loading state without fabricated scores, metrics, actions or comparisons", () => {
  mocks.fetch.mockReturnValue(new Promise(() => {}));
  render(<MonthlyReportPage />);
  expect(screen.getByRole("status").textContent).toContain("取得しています");
  expectNeutral();
  expect(mocks.fetch.mock.calls[0][0]).toBe("/api/dashboard/reports?month=2026-08&schoolId=school-a");
});

it.each([{}, { report: null }, { report: {} }, { report: { ...report(), score: null } },
  { report: { ...report(), metrics: [null] } }, { report: { ...report(), actions: [{}] } },
  { report: { ...report(), rank: "unknown" } }, { report: { ...report(), score: "0" } },
])("does not substitute a sample for absent or incomplete data: %j", async body => {
  mocks.fetch.mockResolvedValue(response({ success: true, ...body }));
  render(<MonthlyReportPage />);
  await screen.findByText("この校舎・対象期間のレポートは未取得です。");
  expectNeutral();
});

it.each(["http", "api", "network", "json"])("keeps a neutral error state after %s failure", async kind => {
  mocks.fetch.mockImplementation(async () => {
    if (kind === "network") throw new Error("通信失敗");
    if (kind === "json") return new Response("{");
    return response({ success: kind !== "api", error: "取得失敗", report: report() }, kind === "http" ? 500 : 200);
  });
  render(<MonthlyReportPage />);
  await screen.findByRole("alert");
  expectNeutral();
});

it("preserves a complete successful report including actual zero and empty arrays", async () => {
  mocks.fetch.mockResolvedValue(response({ success: true, report: { ...report("検証用A校", 0), actions: [] } }));
  render(<MonthlyReportPage />);
  await screen.findByRole("img", { name: "総合評価 0点" });
  expect(screen.getByText("0/100点")).toBeTruthy();
  expect(screen.getByText("0件")).toBeTruthy();
  expect(screen.getByText("C判定")).toBeTruthy();
  expect(screen.getByText("取得したレポートのコメント")).toBeTruthy();
  expect(screen.getByText("比較データは未取得です。")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("取得した月次レポートを表示しています。");
});

it.each(["school", "month", "url-month"])("immediately hides the old report when %s changes", async change => {
  mocks.fetch.mockResolvedValueOnce(response({ success: true, report: report() }));
  const pending = deferred();
  mocks.fetch.mockReturnValueOnce(pending.promise);
  const view = render(<MonthlyReportPage />);
  await screen.findByRole("img", { name: "総合評価 42点" });
  if (change === "month") fireEvent.change(screen.getByLabelText("対象期間"), { target: { value: "2026-07" } });
  else {
    mocks.params = new URLSearchParams(change === "school" ? "schoolId=school-b&month=2026-08" : "schoolId=school-a&month=2026-07");
    view.rerender(<MonthlyReportPage />);
  }
  expectNeutral();
  expect(screen.queryByText(/検証用A校 の/)).toBeNull();
  expect(mocks.fetch.mock.calls[1][0]).toContain(change === "school" ? "schoolId=school-b" : "month=2026-07");
  await act(async () => pending.resolve(response({ success: true, report: report("切替後の校舎", 17) })));
  expect(screen.getByRole("img", { name: "総合評価 17点" })).toBeTruthy();
});

it.each(["success", "error"])("ignores an aborted request's late %s after the next selection succeeds", async outcome => {
  const old = deferred();
  mocks.fetch.mockReturnValueOnce(old.promise).mockResolvedValueOnce(response({ success: true, report: report("検証用B校", 17) }));
  const view = render(<MonthlyReportPage />);
  const signal = mocks.fetch.mock.calls[0][1].signal as AbortSignal;
  mocks.params = new URLSearchParams("schoolId=school-b&month=2026-08");
  view.rerender(<MonthlyReportPage />);
  await screen.findByRole("img", { name: "総合評価 17点" });
  expect(signal.aborted).toBe(true);
  await act(async () => {
    if (outcome === "success") old.resolve(response({ success: true, report: report("古い校舎", 99) }));
    else old.reject(new Error("古い失敗"));
  });
  expect(screen.getByRole("img", { name: "総合評価 17点" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/古い校舎/)).toBeNull();
});

it("recovers from an error when another month loads successfully", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("通信失敗"))
    .mockResolvedValueOnce(response({ success: true, report: report() }));
  render(<MonthlyReportPage />);
  await screen.findByRole("alert");
  fireEvent.change(screen.getByLabelText("対象期間"), { target: { value: "2026-07" } });
  await screen.findByRole("img", { name: "総合評価 42点" });
  expect(screen.queryByRole("alert")).toBeNull();
});

it("invalidates a manual month choice when URL months change and return", async () => {
  mocks.fetch.mockResolvedValue(response({ success: true, report: report() }));
  const view = render(<MonthlyReportPage />);
  await screen.findByRole("img", { name: "総合評価 42点" });
  fireEvent.change(screen.getByLabelText("対象期間"), { target: { value: "2026-07" } });
  await screen.findByRole("img", { name: "総合評価 42点" });
  mocks.params = new URLSearchParams("schoolId=school-a&month=2026-06");
  view.rerender(<MonthlyReportPage />);
  await screen.findByRole("img", { name: "総合評価 42点" });
  mocks.params = new URLSearchParams("schoolId=school-a&month=2026-08");
  view.rerender(<MonthlyReportPage />);
  expect((screen.getByLabelText("対象期間") as HTMLSelectElement).value).toBe("2026-08");
  await screen.findByRole("img", { name: "総合評価 42点" });
  expect(mocks.fetch.mock.calls.at(-1)?.[0]).toContain("month=2026-08");
});

it("shows the returned report period separately from the requested month", async () => {
  mocks.params = new URLSearchParams("schoolId=school-a&month=2026-07");
  mocks.fetch.mockResolvedValue(response({ success: true, report: report() }));
  render(<MonthlyReportPage />);
  await screen.findByRole("img", { name: "総合評価 42点" });
  expect((screen.getByLabelText("対象期間") as HTMLSelectElement).value).toBe("2026-07");
  expect(screen.getByText("レポート対象期間: 2026年8月度")).toBeTruthy();
});
