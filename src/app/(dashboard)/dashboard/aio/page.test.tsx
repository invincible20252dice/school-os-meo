// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AioDashboardPage from "./page";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import type { AioViewData, MeasurementView } from "@/lib/aio-view";
vi.mock("@/lib/supabase", () => ({ createBrowserSupabaseClient: vi.fn() }));
let schoolId = "school-a";
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ schoolId }) }));
const base = (): AioViewData => ({ configured: true, canMeasure: true, pilotKeywordId: "k", keywords: [{ id: "k", keyword: "地域 塾", municipality: "検証市", nearestStation: "検証駅", latest: null }] });
const record = (status: string, recommended: boolean | null = null): MeasurementView => ({ id: "m", status, query: "地域の塾", response: "検証回答", brandDetected: recommended, recommended, score: recommended === null ? null : recommended ? 100 : 0, measuredAt: recommended === null ? null : new Date().toISOString(), createdAt: new Date().toISOString(), model: "gpt-4.1-mini", errorCode: status === "FAILED" ? "QUOTA" : null, evidence: recommended ? "検証回答" : null, citations: [{ url: "https://example.org", title: "出典" }] });
let state: AioViewData;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  schoolId = "school-a"; state = base();
  vi.mocked(createBrowserSupabaseClient).mockReturnValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "unit-test-session" } } }) } } as unknown as ReturnType<typeof createBrowserSupabaseClient>);
  fetcher = vi.fn().mockImplementation(async (_url, init) => {
    if (init.method === "POST") state = { ...state, pilotKeywordId: "k", keywords: [{ ...state.keywords[0], latest: record("SUCCESS", false) }] };
    return new Response(JSON.stringify({ success: true, ...state }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("does not convert unmeasured data into zero", async () => {
  render(<AioDashboardPage />);
  await screen.findByText("未計測", { exact: true });
  expect(screen.queryByText("0%")).toBeNull();
  expect(screen.getByText("登録 1件")).toBeDefined();
});
it.each([["SUCCESS", false, "0%"], ["SUCCESS", true, "100%"], ["FAILED", null, "計測失敗（QUOTA）"], ["CONFIG_REQUIRED", null, "設定が必要"], ["RUNNING", null, "計測中"]] as const)("shows %s without confusing it with zero", async (status, recommended, expected) => {
  state.keywords[0].latest = record(status, recommended);
  render(<AioDashboardPage />);
  await screen.findByText(expected, { exact: true });
  if (status !== "SUCCESS") expect(screen.queryByText("0%")).toBeNull();
});
it("shows missing API configuration and disables paid action", async () => {
  state.configured = false;
  render(<AioDashboardPage />);
  await screen.findByText("設定が必要");
  expect((screen.getByRole("button", { name: "このキーワードを計測" }) as HTMLButtonElement).disabled).toBe(true);
});
it("saves one request, refetches, and displays the persisted answer after a remount", async () => {
  const view = render(<AioDashboardPage />);
  fireEvent.click(await screen.findByRole("button", { name: "このキーワードを計測" }));
  await screen.findByText("0%", { exact: true });
  expect(fetcher.mock.calls.filter(call => call[1].method === "POST")).toHaveLength(1);
  expect(JSON.parse(fetcher.mock.calls.find(call => call[1].method === "POST")![1].body)).toMatchObject({ keywordId: "k", requestId: expect.any(String) });
  view.unmount();
  render(<AioDashboardPage />);
  await screen.findByText("検証回答", { exact: true });
  expect(screen.getByText("0%", { exact: true })).toBeDefined();
  fireEvent.click(screen.getByText("出典を見る（1件）"));
  expect(screen.getByRole("link", { name: "出典" }).getAttribute("href")).toBe("https://example.org");
});
it("shows DB failures as errors, not zero", async () => {
  fetcher.mockResolvedValue(new Response(JSON.stringify({ success: false }), { status: 503 }));
  render(<AioDashboardPage />);
  await screen.findByRole("alert");
  expect(screen.queryByText("0%")).toBeNull();
});
it("disables measurement for read-only members", async () => {
  state.canMeasure = false;
  render(<AioDashboardPage />);
  expect((await screen.findByRole("button", { name: "このキーワードを計測" }) as HTMLButtonElement).disabled).toBe(true);
});
it("selects an active keyword without the obsolete single-keyword gate", async () => {
  state.pilotKeywordId = "foreign-pilot"; state.canMeasure = false;
  render(<AioDashboardPage />);
  await screen.findByText("未計測", { exact: true });
  expect((screen.getByRole("button", { name: "このキーワードを計測" }) as HTMLButtonElement).disabled).toBe(true);
});
it.each(["SUCCESS", "FAILED", "CONFIG_REQUIRED"])("allows deliberate remeasurement after %s; server enforces deduplication", async status => {
  state.keywords[0].latest = record(status, status === "SUCCESS" ? false : null);
  render(<AioDashboardPage />);
  expect((await screen.findByRole("button", { name: "このキーワードを計測" }) as HTMLButtonElement).disabled).toBe(false);
});
it("requires a school, and drops old school's data on school changes", async () => {
  const view = render(<AioDashboardPage />);
  await screen.findByText("未計測", { exact: true });
  schoolId = "all"; view.rerender(<AioDashboardPage />);
  await screen.findByText("校舎を選択してください。");
  expect(screen.queryByText("登録 1件")).toBeNull();
});
it("keeps uncertain failures distinct and allows safe refetch", async () => {
  render(<AioDashboardPage />);
  const button = await screen.findByRole("button", { name: "このキーワードを計測" });
  fetcher.mockRejectedValueOnce(new Error("offline"));
  fireEvent.click(button);
  await screen.findByText("計測を完了できませんでした。再取得して状態を確認してください。");
  fireEvent.click(screen.getByRole("button", { name: "再取得" }));
  await waitFor(() => expect(screen.getByText("未計測", { exact: true })).toBeDefined());
});

it("posts four keywords sequentially, continues stored failures, and computes 1/3 instead of 1/4", async () => {
  state.keywords = Array.from({ length: 4 }, (_, i) => ({ ...base().keywords[0], id: `k${i}`, keyword: `地域 塾 ${i}` }));
  const order: string[] = []; let active = 0, maximum = 0;
  fetcher.mockImplementation(async (_url, init) => {
    if (init.method === "POST") {
      active++; maximum = Math.max(maximum, active);
      const { keywordId } = JSON.parse(init.body); order.push(keywordId);
      await Promise.resolve();
      state = { ...state, keywords: state.keywords.map(k => k.id !== keywordId ? k : { ...k, latest: record(keywordId === "k3" ? "FAILED" : "SUCCESS", keywordId === "k3" ? null : keywordId === "k1") }) };
      active--;
    }
    return new Response(JSON.stringify({ success: true, ...state }));
  });
  render(<AioDashboardPage />);
  fireEvent.click(await screen.findByRole("button", { name: "OpenAIで4件を計測" }));
  await screen.findByText("計測失敗 1件");
  await screen.findByText(/4 \/ 4件確認/);
  expect(screen.getByText("33%", { exact: true })).toBeDefined();
  expect(order).toEqual(["k0", "k1", "k2", "k3"]); expect(maximum).toBe(1);
});

it("stops an uncertain batch instead of silently retrying or spending on the remaining keywords", async () => {
  state.keywords = [base().keywords[0], { ...base().keywords[0], id: "k2" }];
  fetcher.mockImplementation(async (_url, init) => {
    if (init.method === "POST") throw new Error("uncertain transport");
    return new Response(JSON.stringify({ success: true, ...state }));
  });
  render(<AioDashboardPage />);
  fireEvent.click(await screen.findByRole("button", { name: "OpenAIで2件を計測" }));
  await screen.findByText("計測を完了できませんでした。再取得して状態を確認してください。");
  expect(fetcher.mock.calls.filter(call => call[1].method === "POST")).toHaveLength(1);
});
